import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { gps808Api, setServerUrl, Gps808Vehicle, resetServerUrlCache } from '@/utils/gps808Api';
import { Platform } from 'react-native';
import { useAuthStore } from './authStore';

const IS_WEB = Platform.OS === 'web';
const JSESSION_STORAGE_KEY = 'gps808_jsession';

interface Gps808Config {
  serverUrl: string;
  account: string;
  password: string;
}

interface Gps808State {
  config: Gps808Config;
  isConnected: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  loadConfig: () => Promise<void>;
  saveConfig: (config: Gps808Config) => Promise<void>;
  testConnection: (config: Gps808Config) => Promise<boolean>;
  disconnect: () => Promise<void>;
  clearError: () => void;
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
function getWebProxyUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_GPS_PROXY_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/gps`;
  }
  return `http://localhost:3001/api/gps`;
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
  const initialState: Pick<Gps808State, 'config' | 'isConnected' | 'isLoading' | 'isSaving' | 'error'> = {
    config: getInitialConfig(),
    isConnected: false, // 先設為 false，避免閃爍
    isLoading: true,
    isSaving: false,
    error: null,
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

      const stored = await storage.getItem(getStorageKey());
      console.log('[GPS808] loadConfig: stored =', stored);
      console.log('[GPS808] loadConfig: Platform.OS =', Platform.OS);
      console.log('[GPS808] loadConfig: WEB_AUTO_CONNECT =', WEB_AUTO_CONNECT);
      console.log('[GPS808] loadConfig: WEB_ENV_CONFIG =', WEB_ENV_CONFIG);

      // Case 1: 有 stored config → 直接 relogin/ping
      if (stored) {
        const parsed = JSON.parse(stored) as Gps808Config;
        // Web 端：使用 proxy URL 避免 CORS 問題
        if (IS_WEB) {
          const proxyUrl = getWebProxyUrl();
          await setServerUrl(proxyUrl);
        } else {
          await setServerUrl(parsed.serverUrl);
        }
        set({ config: parsed });

        // Try ping first (有 stored jsession 才能 ping 過)
        const valid = await gps808Api.ping();
        if (valid) {
          set({ isConnected: true, isLoading: false });
          return;
        }

        // ping 失敗：用 stored 帳密 relogin（這是關鍵的自動重連機制）
        if (parsed.account && parsed.password) {
          console.log('[GPS808] loadConfig: stored config found, attempting relogin with parsed.account =', parsed.account);
          if (IS_WEB) {
            const proxyUrl = getWebProxyUrl();
            await setServerUrl(proxyUrl);
          } else {
            await setServerUrl(parsed.serverUrl);
          }
          const result = await gps808Api.login(parsed.account, parsed.password);
          console.log('[GPS808] loadConfig: relogin result =', result);
          if (result.success) {
            // 登入成功，同時保存 config 到 storage（確保 session 持久化）
            await storage.setItem(getStorageKey(), JSON.stringify(parsed));
            set({ isConnected: true, isLoading: false });
          } else {
            set({ isConnected: false, isLoading: false, error: result.error || null });
          }
        } else {
          set({ isLoading: false });
        }
        return;
      }

      // Case 2: 沒有 stored config → 但 user 之前已登入（storage 還有 jsession）
      // 重新整理後這種情況很常見：用戶手動登入後 stored config 若被清掉，
      // 但 jsession 還在，這時用 stored jsession 試 ping，ping 不過也沒關係，
      // 至少可以提示 UI「曾連線」並在背景嘗試 relogin。
      if (IS_WEB) {
        const jsessionStill = await storage.getItem(JSESSION_STORAGE_KEY);
        if (jsessionStill) {
          // 有 jsession 就標記為已連線並嘗試 ping
          set({ isConnected: true });
          
          // 嘗試 ping 驗證 session 是否仍然有效
          const valid = await gps808Api.ping();
          if (!valid) {
            // Session 已過期，需要用環境變數的帳密重新登入
            if (WEB_AUTO_CONNECT && WEB_ENV_CONFIG.account && WEB_ENV_CONFIG.password) {
              const proxyUrl = getWebProxyUrl();
              await setServerUrl(proxyUrl);
              const result = await gps808Api.login(WEB_ENV_CONFIG.account, WEB_ENV_CONFIG.password);
              if (result.success) {
                set({ isConnected: true, isLoading: false });
                return;
              }
            }
            // 環境變數登入也失敗，保持 isConnected=true 但不顯示錯誤
            // 因為用戶可能手動配置，不需要環境變數
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
        } else {
          set({ config: WEB_ENV_CONFIG, isLoading: false, error: result.error || null });
        }
        return;
      }

      console.log('[GPS808] loadConfig: no stored config, no jsession, no env auto-connect');
      set({ isLoading: false });
    } catch (err) {
      console.error('[GPS808] loadConfig: error =', err);
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
    set({ config: DEFAULT_CONFIG, isConnected: false, error: null });
  },

  clearError: () => set({ error: null }),
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
