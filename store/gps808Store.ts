import { create } from 'zustand';
import { storage, isWebPlatform as IS_WEB } from '@/utils/storage';
import { gps808Api, setServerUrl, Gps808Vehicle, resetServerUrlCache } from '@/utils/gps808Api';
import { Platform } from 'react-native';
import { useAuthStore } from './authStore';
import {
  fetchGps808SharedConfig,
  upsertGps808SharedConfig,
  resetGps808SharedConfig,
} from '@/utils/gps808SharedSupabase';

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

/** 共用配置的本機快取 key（不再以 user 區分） */
const SHARED_LOCAL_CACHE_KEY = 'gps808_shared_config';

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

/** 判斷當前使用者是否為管理員（共用配置的寫入者） */
function isAdminUser(): boolean {
  return useAuthStore.getState().user?.id === 'u-admin';
}

/**
 * 預載：從 storage 讀取「上次連線狀態」，避免刷新頁面後 isConnected 閃成 false。
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
  const initialState: Pick<Gps808State, 'config' | 'isConnected' | 'isLoading' | 'isSaving' | 'error' | 'deviceStatusCache'> = {
    config: getInitialConfig(),
    isConnected: false,
    isLoading: true,
    isSaving: false,
    error: null,
    deviceStatusCache: {},
  };

  if (IS_WEB) {
    void loadInitialConnectionState().then((wasConnected) => {
      if (wasConnected && !useGps808Store.getState().isConnected) {
        useGps808Store.setState({ isConnected: true });
      }
    });
    resetServerUrlCache();
  }

  return {
    ...initialState,

    loadConfig: async () => {
      set({ isLoading: true, error: null });
      try {
        const proxyUrl = IS_WEB ? getWebProxyUrl() : null;
        if (IS_WEB) {
          console.log('[GPS808] loadConfig: using proxyUrl =', proxyUrl);
          await setServerUrl(proxyUrl!);
        }

        let parsed: Gps808Config | null = null;
        let cloudIsConnected = false;
        let hadCredentials = false; // localStorage 有 credentials

        // 1) 優先從 Supabase 共用單列讀取（跨裝置同步）
        try {
          const cloudConfig = await fetchGps808SharedConfig();
          console.log('[GPS808] loadConfig: Supabase fetch result =', cloudConfig);
          if (cloudConfig && cloudConfig.account && cloudConfig.password) {
            parsed = {
              serverUrl: cloudConfig.server_url,
              account: cloudConfig.account,
              password: cloudConfig.password,
            };
            cloudIsConnected = cloudConfig.is_connected;
            hadCredentials = true;
            console.log('[GPS808] loadConfig: parsed from Supabase, is_connected =', cloudIsConnected);
          } else {
            console.log('[GPS808] loadConfig: Supabase row empty or missing credentials');
          }
        } catch (e) {
          console.log('[GPS808] loadConfig: Supabase fetch failed, fallback to localStorage', e);
        }

        // 2) 回退到本機快取（單一瀏覽器本地優先）
        if (!parsed) {
          const stored = await storage.getItem(SHARED_LOCAL_CACHE_KEY);
          if (stored) {
            try {
              parsed = JSON.parse(stored) as Gps808Config;
              hadCredentials = true;
              console.log('[GPS808] loadConfig: parsed from localStorage');
            } catch (e) {
              console.log('[GPS808] loadConfig: localStorage parse failed', e);
            }
          }
        }

        // 3) 都沒有 config，但有 env 自動連線（web 開發用）
        if (!parsed && Platform.OS === 'web' && WEB_AUTO_CONNECT && WEB_ENV_CONFIG.account) {
          parsed = WEB_ENV_CONFIG;
          hadCredentials = true;
          console.log('[GPS808] loadConfig: using WEB_ENV_CONFIG (auto-connect)');
        }

        if (!parsed) {
          console.log('[GPS808] loadConfig: no config found, returning');
          set({ isLoading: false });
          return;
        }

        console.log('[GPS808] loadConfig: final parsed config, account =', parsed.account, 'hasPassword =', !!parsed.password);
        set({ config: parsed });

        // 4) 有 credentials → 嘗試 login
        // （GPS Proxy Worker 會自動維護 session，若仍有效會直接成功；若過期則重新 login）
        if (parsed.account && parsed.password) {
          console.log('[GPS808] loadConfig: calling gps808Api.login()...');
          const result = await gps808Api.login(parsed.account, parsed.password);
          console.log('[GPS808] loadConfig: login result =', result);

          if (result.success) {
            await storage.setItem(SHARED_LOCAL_CACHE_KEY, JSON.stringify(parsed));
            console.log('[GPS808] loadConfig: SUCCESS, setting isConnected = true');
            set({ isConnected: true, isLoading: false });
          } else {
            console.log('[GPS808] loadConfig: login FAILED, error =', result.error, 'hadCredentials =', hadCredentials);
            // 若有 credentials（上次成功設定過），login 失敗視為暫時性網路問題，
            // 保持 UI connected 狀態（下次有操作時會重試）
            if (hadCredentials) {
              console.log('[GPS808] loadConfig: had credentials → UI stays connected (temporary network issue)');
              set({ isConnected: true, isLoading: false });
            } else {
              console.log('[GPS808] loadConfig: no prior credentials → set disconnected');
              set({ isConnected: false, isLoading: false, error: result.error || null });
            }
          }
        } else {
          console.log('[GPS808] loadConfig: no credentials, returning');
          set({ isLoading: false });
        }
      } catch (e) {
        console.log('[GPS808] loadConfig error:', e);
        set({ isLoading: false });
      }
    },

    saveConfig: async (config: Gps808Config) => {
      if (!isAdminUser()) {
        console.warn('[GPS808] saveConfig blocked: only admin can modify shared config');
        set({ error: '僅管理員可修改 API 配置' });
        return;
      }
      set({ isSaving: true, error: null });
      try {
        await setServerUrl(config.serverUrl);
        await storage.setItem(SHARED_LOCAL_CACHE_KEY, JSON.stringify(config));
        set({ config, isSaving: false });
      } catch {
        set({ isSaving: false, error: 'Failed to save configuration' });
      }
    },

    testConnection: async (config: Gps808Config) => {
      if (!isAdminUser()) {
        console.warn('[GPS808] testConnection blocked: only admin can modify shared config');
        set({ error: '僅管理員可修改 API 配置' });
        return false;
      }
      set({ isSaving: true, error: null });
      try {
        const effectiveServerUrl = IS_WEB ? getWebProxyUrl() : config.serverUrl;
        await setServerUrl(effectiveServerUrl);
        const result = await gps808Api.login(config.account, config.password);
        if (result.success) {
          await storage.setItem(SHARED_LOCAL_CACHE_KEY, JSON.stringify({ ...config }));
          set({ config, isConnected: true, isSaving: false });

          // 同步到 Supabase 共用單列
          await upsertGps808SharedConfig(
            {
              server_url: config.serverUrl,
              account: config.account,
              password: config.password,
              is_connected: true,
            },
            'u-admin'
          );

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
      if (!isAdminUser()) {
        console.warn('[GPS808] disconnect blocked: only admin can modify shared config');
        return;
      }
      await gps808Api.logout();
      await storage.removeItem(SHARED_LOCAL_CACHE_KEY);
      await storage.removeItem(JSESSION_STORAGE_KEY);

      // 重置 Supabase 共用單列
      await resetGps808SharedConfig('u-admin');

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
