import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { gps808Api, setServerUrl, Gps808Vehicle, resetServerUrlCache } from '@/utils/gps808Api';
import { Platform } from 'react-native';
import { useAuthStore } from './authStore';
import {
  fetchGps808ConfigFromSupabase,
  upsertGps808ConfigToSupabase,
  deleteGps808ConfigFromSupabase,
} from '@/utils/gps808Supabase';

const IS_WEB = Platform.OS === 'web';
const JSESSION_STORAGE_KEY = 'gps808_jsession';

interface Gps808Config {
  serverUrl: string;
  account: string;
  password: string;
}

/**
 * GPS 設備狀態類型
 * - moving: 行駛中
 * - parked: 已停泊
 * - offline: 無訊號 / 離線
 * - unknown: 未知
 */
export type GpsDeviceStatusType = 'moving' | 'parked' | 'offline' | 'unknown';

/**
 * GPS 設備狀態快取項目
 */
export interface GpsDeviceStatusCache {
  devIdno: string;
  status: GpsDeviceStatusType;
  speed: number;
  onlineStatus: number;
  lastUpdate: number;
}

interface Gps808State {
  config: Gps808Config;
  isConnected: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  /** 各 GPS 設備狀態快取（key = devIdno） */
  deviceStatusCache: Record<string, GpsDeviceStatusCache>;
  loadConfig: () => Promise<void>;
  saveConfig: (config: Gps808Config) => Promise<void>;
  testConnection: (config: Gps808Config) => Promise<boolean>;
  disconnect: () => Promise<void>;
  clearError: () => void;
  /** 取得單一設備的快取狀態，若無則回傳 undefined */
  getDeviceStatus: (devIdno: string) => GpsDeviceStatusCache | undefined;
  /** 批次寫入/更新設備狀態快取 */
  batchUpdateDeviceStatus: (statuses: GpsDeviceStatusCache[]) => void;
}

function getStorageKey(): string {
  const userId = useAuthStore.getState().user?.id ?? 'guest';
  return `gps808_config_${userId}`;
}
const DEFAULT_CONFIG: Gps808Config = {
  serverUrl: 'https://console.onefleet.hk',
  account: '',
  password: '',
};

// Web env-based defaults (dev/demo only)
const WEB_ENV_CONFIG: Gps808Config = {
  serverUrl: process.env.EXPO_PUBLIC_GPS808_SERVER_URL ?? DEFAULT_CONFIG.serverUrl,
  account: process.env.EXPO_PUBLIC_GPS808_ACCOUNT ?? '',
  password: process.env.EXPO_PUBLIC_GPS808_PASSWORD ?? '',
};
const WEB_AUTO_CONNECT = process.env.EXPO_PUBLIC_GPS808_AUTO_CONNECT === 'true';

// 與 gps808Api.ts 保持一致的 proxy URL 解析邏輯
// LAN 訪問時：把 port 從 metro (8081) 換成 GPS proxy (3001)

/** 本機 GPS proxy port（需與 gps808Api.ts 的 PROXY_PORT 同步） */
const PROXY_PORT_LOCAL = 3001;

function getWebProxyUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_GPS_PROXY_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return `http://localhost:${PROXY_PORT_LOCAL}/api/gps`;
    }
    // LAN 訪問：把 port 從 metro dev server 換成 GPS proxy port
    if (window.location?.port) {
      return `${window.location.protocol}//${host}:${PROXY_PORT_LOCAL}/api/gps`;
    }
    // 同源部署（reverse proxy）：origin 已經對應 proxy
    return `${window.location.origin}/api/gps`;
  }
  return `http://localhost:${PROXY_PORT_LOCAL}/api/gps`;
}

function getInitialConfig(): Gps808Config {
  if (Platform.OS === 'web' && WEB_AUTO_CONNECT && WEB_ENV_CONFIG.account) {
    return WEB_ENV_CONFIG;
  }
  return DEFAULT_CONFIG;
}

/**
 * 預載：從 storage 讀取「上次連線狀態」，避免刷新頁面後 isConnected 閃成 false。
 * 此函式在 store 建立時立即同步執行（不透過 useEffect）。
 * 注意：Web Storage 是同步的，但為了介面一致仍用 async。
 */
async function loadInitialConnectionState(): Promise<boolean> {
  if (!IS_WEB) return false;
  try {
    const jsession = await storage.getItem(JSESSION_STORAGE_KEY);
    return !!jsession;
  } catch {
    return false;
  }
}

export const useGps808Store = create<Gps808State>((set, get) => {
  // 在 store 初始化時把 isConnected 設定為「與 storage 一致」的樂觀值，
  // 避免初次 render 顯示為 false，refresh 之後使用者必須重新設定的錯覺。
  const initialState: Pick<Gps808State, 'config' | 'isConnected' | 'isLoading' | 'isSaving' | 'error' | 'deviceStatusCache'> = {
    config: getInitialConfig(),
    isConnected: false, // 先設為 false，避免閃爍
    isLoading: true,
    isSaving: false,
    error: null,
    deviceStatusCache: {},
  };

  // Fire-and-forget：非同步把正確的初始連線狀態寫回 store
  if (IS_WEB) {
    void loadInitialConnectionState().then((wasConnected) => {
      if (wasConnected && !useGps808Store.getState().isConnected) {
        // 只在 store 還沒被外部 update 時才覆蓋（避免 race）
        useGps808Store.setState({ isConnected: true });
      }
    });
    // Reload 之後 module 重新執行，把 runtimeServerUrl cache 清掉以重新計算
    resetServerUrlCache();
  }

  return {
    ...initialState,

  loadConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      // Web 端：先確保 serverUrl 是 proxy URL（CORS 必要）
      if (IS_WEB) {
        const proxyUrl = getWebProxyUrl();
        await setServerUrl(proxyUrl);
      }

      const currentUser = useAuthStore.getState().user;
      const userId = currentUser?.id || 'u-admin';
      console.log('[GPS808] loadConfig: userId =', userId);

      // 優先從 Supabase 載入（多設備同步的核心）
      let parsed: Gps808Config | null = null;
      let cloudIsConnected = false;

      try {
        const cloudConfig = await fetchGps808ConfigFromSupabase(userId);
        if (cloudConfig) {
          parsed = {
            serverUrl: cloudConfig.server_url,
            account: cloudConfig.account,
            password: cloudConfig.password,
          };
          cloudIsConnected = cloudConfig.is_connected;
          console.log('[GPS808] loadConfig: loaded from Supabase, is_connected =', cloudIsConnected);
        }
      } catch (e) {
        console.log('[GPS808] loadConfig: Supabase fetch failed, fallback to localStorage', e);
      }

      // 回退到 localStorage（離線快取）
      if (!parsed) {
        const stored = await storage.getItem(getStorageKey());
        console.log('[GPS808] loadConfig: stored (localStorage) =', stored ? 'has data' : 'empty');
        if (stored) {
          try {
            parsed = JSON.parse(stored) as Gps808Config;
          } catch (e) {
            console.log('[GPS808] loadConfig: localStorage parse failed', e);
          }
        }
      }

      // Case 1: 有 config → 驗證登入狀態
      if (parsed) {
        // Web 端：使用 proxy URL 避免 CORS 問題
        if (IS_WEB) {
          const proxyUrl = getWebProxyUrl();
          await setServerUrl(proxyUrl);
        } else {
          await setServerUrl(parsed.serverUrl);
        }
        set({ config: parsed });

        // 如果 Supabase 標記為用戶主動中斷（is_connected=false）→ 直接視為未連線
        if (!cloudIsConnected && parsed) {
          // 但仍保留 config 讓使用者不用重打（除非他們也要清掉）
          // 標記為未連線，但 config 仍保存
          set({ isConnected: false, isLoading: false });
          return;
        }

        // Try ping first
        const valid = await gps808Api.ping();
        if (valid) {
          set({ isConnected: true, isLoading: false });
          await storage.setItem(getStorageKey(), JSON.stringify(parsed));
          await upsertGps808ConfigToSupabase({
            user_id: userId,
            server_url: parsed.serverUrl,
            account: parsed.account,
            password: parsed.password,
            is_connected: true,
          });
          return;
        }

        // ping 失敗：用 stored 帳密 relogin
        if (parsed.account && parsed.password) {
          console.log('[GPS808] loadConfig: attempting relogin with account =', parsed.account);
          if (IS_WEB) {
            const proxyUrl = getWebProxyUrl();
            await setServerUrl(proxyUrl);
          } else {
            await setServerUrl(parsed.serverUrl);
          }
          const result = await gps808Api.login(parsed.account, parsed.password);
          console.log('[GPS808] loadConfig: relogin result =', result);
          if (result.success) {
            await storage.setItem(getStorageKey(), JSON.stringify(parsed));
            set({ isConnected: true, isLoading: false });
            await upsertGps808ConfigToSupabase({
              user_id: userId,
              server_url: parsed.serverUrl,
              account: parsed.account,
              password: parsed.password,
              is_connected: true,
            });
          } else {
            set({ isConnected: false, isLoading: false, error: result.error || null });
          }
        } else {
          set({ isLoading: false });
        }
        return;
      }

      // Case 2: 沒有 stored config → 但 user 之前已登入（storage 還有 jsession）
      if (IS_WEB) {
        const jsessionStill = await storage.getItem(JSESSION_STORAGE_KEY);
        if (jsessionStill) {
          set({ isConnected: true });

          const valid = await gps808Api.ping();
          if (!valid) {
            if (WEB_AUTO_CONNECT && WEB_ENV_CONFIG.account && WEB_ENV_CONFIG.password) {
              const proxyUrl = getWebProxyUrl();
              await setServerUrl(proxyUrl);
              const result = await gps808Api.login(WEB_ENV_CONFIG.account, WEB_ENV_CONFIG.password);
              if (result.success) {
                set({ isConnected: true, isLoading: false });
                await upsertGps808ConfigToSupabase({
                  user_id: userId,
                  server_url: WEB_ENV_CONFIG.serverUrl,
                  account: WEB_ENV_CONFIG.account,
                  password: WEB_ENV_CONFIG.password,
                  is_connected: true,
                });
                return;
              }
            }
            set({ isLoading: false });
          } else {
            set({ isLoading: false });
          }
          return;
        }
      }

      // Case 3: 既無 stored config 也無 jsession，但有 env 自動連線
      if (Platform.OS === 'web' && WEB_AUTO_CONNECT && WEB_ENV_CONFIG.account) {
        console.log('[GPS808] loadConfig: attempting env-based auto-connect...');
        const proxyUrl = getWebProxyUrl();
        await setServerUrl(proxyUrl);
        const result = await gps808Api.login(WEB_ENV_CONFIG.account, WEB_ENV_CONFIG.password);
        console.log('[GPS808] loadConfig: login result =', result);
        if (result.success) {
          set({ config: WEB_ENV_CONFIG, isConnected: true, isLoading: false });
          await storage.setItem(getStorageKey(), JSON.stringify(WEB_ENV_CONFIG));
          await upsertGps808ConfigToSupabase({
            user_id: userId,
            server_url: WEB_ENV_CONFIG.serverUrl,
            account: WEB_ENV_CONFIG.account,
            password: WEB_ENV_CONFIG.password,
            is_connected: true,
          });
        } else {
          set({ config: WEB_ENV_CONFIG, isLoading: false, error: result.error || null });
        }
        return;
      }

      set({ isLoading: false });
    } catch (e) {
      console.log('[GPS808] loadConfig error:', e);
      set({ isLoading: false });
    }
  },

  saveConfig: async (config: Gps808Config) => {
    set({ isSaving: true, error: null });
    try {
      await setServerUrl(config.serverUrl);
      await storage.setItem(getStorageKey(), JSON.stringify(config));
      set({ config, isSaving: false });
    } catch {
      set({ isSaving: false, error: 'Failed to save configuration' });
    }
  },

  testConnection: async (config: Gps808Config) => {
    set({ isSaving: true, error: null });
    try {
      // Web 端：使用 proxy URL 避免 CORS 問題
      // 只有移動端可以直接請求 console.onefleet.hk
      const effectiveServerUrl = IS_WEB ? getWebProxyUrl() : config.serverUrl;

      await setServerUrl(effectiveServerUrl);
      const result = await gps808Api.login(config.account, config.password);
      if (result.success) {
      await storage.setItem(getStorageKey(), JSON.stringify({ ...config }));
      set({ config, isConnected: true, isSaving: false });

      // 同步到 Supabase（多設備同步）
      const currentUser = useAuthStore.getState().user;
      const userId = currentUser?.id || 'u-admin';
      await upsertGps808ConfigToSupabase({
        user_id: userId,
        server_url: config.serverUrl,
        account: config.account,
        password: config.password,
        is_connected: true,
      });

        return true;
      } else {
        set({ error: result.error || 'Connection failed', isSaving: false });
        return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      set({ error: msg, isSaving: false });
      return false;
    }
  },

  disconnect: async () => {
    await gps808Api.logout();
    await storage.removeItem(getStorageKey());

    // 從 Supabase 刪除（多設備同步）
    const currentUser = useAuthStore.getState().user;
    const userId = currentUser?.id || 'u-admin';
    await deleteGps808ConfigFromSupabase(userId);

    set({ config: DEFAULT_CONFIG, isConnected: false, error: null, deviceStatusCache: {} });
  },

  clearError: () => set({ error: null }),

  getDeviceStatus: (devIdno: string) => {
    return get().deviceStatusCache[devIdno];
  },

  batchUpdateDeviceStatus: (statuses: GpsDeviceStatusCache[]) => {
    if (!statuses || statuses.length === 0) return;
    set((state) => {
      const next = { ...state.deviceStatusCache };
      for (const s of statuses) {
        if (!s || !s.devIdno) continue;
        next[s.devIdno] = s;
      }
      return { deviceStatusCache: next };
    });
  },
  };
});

// 從 GPS 808 系統獲取車輛列表
export async function fetchGpsVehicles(): Promise<Gps808Vehicle[]> {
  try {
    const response = await gps808Api.queryVehicleList(1, 500);
    if (response.result === 0 && response.infos) {
      return response.infos;
    }
    console.log('[GPS808] queryVehicleList response:', response);
    return [];
  } catch (error) {
    console.error('[GPS808] Failed to fetch vehicles:', error);
    return [];
  }
}
