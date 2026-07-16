import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { gps808Api, setServerUrl, Gps808Vehicle } from '@/utils/gps808Api';
import { Platform } from 'react-native';

const IS_WEB = Platform.OS === 'web';

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

const STORAGE_KEY = 'gps808_config';
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

/**
 * Detect if running on Vercel (or other production deployment)
 */
function isVercelDeployment(): boolean {
  if (typeof window === 'undefined') return false;
  const origin = window.location.origin;
  return (
    origin.includes('vercel.app') ||
    origin.includes('onfleet') ||
    !origin.includes('localhost') &&
    !origin.includes('127.0.0.1') &&
    !origin.includes('192.168.')
  );
}

/**
 * Get the GPS API proxy URL for web
 * - Vercel: use relative path /api/gps (handled by Vercel API route)
 * - Local dev: use localhost:3001 proxy
 */
function getWebProxyUrl(): string {
  if (isVercelDeployment()) {
    // Use relative path - Vercel will route to our API route
    return ''; // Empty means use /api/gps relative
  }
  // Local development
  return process.env.EXPO_PUBLIC_GPS_PROXY_URL || 'http://localhost:3001/api/gps';
}

function getInitialConfig(): Gps808Config {
  if (Platform.OS === 'web' && WEB_AUTO_CONNECT && WEB_ENV_CONFIG.account) {
    return WEB_ENV_CONFIG;
  }
  return DEFAULT_CONFIG;
}

export const useGps808Store = create<Gps808State>((set, get) => ({
  config: getInitialConfig(),
  isConnected: false,
  isLoading: true,
  isSaving: false,
  error: null,

  loadConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const stored = await storage.getItem(STORAGE_KEY);
      console.log('[GPS808] loadConfig: stored =', stored);
      console.log('[GPS808] loadConfig: Platform.OS =', Platform.OS);
      console.log('[GPS808] loadConfig: WEB_AUTO_CONNECT =', WEB_AUTO_CONNECT);
      console.log('[GPS808] loadConfig: WEB_ENV_CONFIG =', WEB_ENV_CONFIG);
      if (!stored) {
        // No stored config — try env-based auto-connect on web
        if (Platform.OS === 'web' && WEB_AUTO_CONNECT && WEB_ENV_CONFIG.account) {
          console.log('[GPS808] loadConfig: attempting env-based auto-connect...');
          // Web 端：使用相對路徑 (Vercel) 或 proxy URL (local dev)
          const proxyUrl = getWebProxyUrl();
          if (proxyUrl) {
            await setServerUrl(proxyUrl);
          }
          const result = await gps808Api.login(WEB_ENV_CONFIG.account, WEB_ENV_CONFIG.password);
          console.log('[GPS808] loadConfig: login result =', result);
          if (result.success) {
            set({ config: WEB_ENV_CONFIG, isConnected: true, isLoading: false });
          } else {
            set({ config: WEB_ENV_CONFIG, isLoading: false, error: result.error || null });
          }
        } else {
          console.log('[GPS808] loadConfig: skipping auto-connect');
          set({ isLoading: false });
        }
        return;
      }
      const parsed = JSON.parse(stored) as Gps808Config;
      // Web 端：使用相對路徑 (Vercel) 或 proxy URL (local dev)
      if (IS_WEB) {
        const proxyUrl = getWebProxyUrl();
        if (proxyUrl) {
          await setServerUrl(proxyUrl);
        }
      } else {
        await setServerUrl(parsed.serverUrl);
      }
      set({ config: parsed });

      // Try restoring session with stored jsession first
      const valid = await gps808Api.ping();
      if (valid) {
        set({ isConnected: true, isLoading: false });
        return;
      }

      // No valid jsession — auto-relogin with stored credentials.
      // Web loses cookies on reload; APK loses in-memory cookies on cold start.
      if (parsed.account && parsed.password) {
        console.log('[GPS808] loadConfig: stored config found, attempting relogin with parsed.account =', parsed.account);
        // Web 端：使用相對路徑 (Vercel) 或 proxy URL (local dev)
        if (IS_WEB) {
          const proxyUrl = getWebProxyUrl();
          if (proxyUrl) {
            await setServerUrl(proxyUrl);
          }
        } else {
          await setServerUrl(parsed.serverUrl);
        }
        const result = await gps808Api.login(parsed.account, parsed.password);
        console.log('[GPS808] loadConfig: relogin result =', result);
        if (result.success) {
          set({ isConnected: true, isLoading: false });
        } else {
          set({ isConnected: false, isLoading: false, error: result.error || null });
        }
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  saveConfig: async (config: Gps808Config) => {
    set({ isSaving: true, error: null });
    try {
      await setServerUrl(config.serverUrl);
      await storage.setItem(STORAGE_KEY, JSON.stringify(config));
      set({ config, isSaving: false });
    } catch {
      set({ isSaving: false, error: 'Failed to save configuration' });
    }
  },

  testConnection: async (config: Gps808Config) => {
    set({ isSaving: true, error: null });
    try {
      // Web 端：使用相對路徑 (Vercel) 或 proxy URL (local dev)
      const effectiveServerUrl = IS_WEB
        ? getWebProxyUrl()
        : config.serverUrl;

      if (effectiveServerUrl) {
        await setServerUrl(effectiveServerUrl);
      }
      const result = await gps808Api.login(config.account, config.password);
      if (result.success) {
        await storage.setItem(STORAGE_KEY, JSON.stringify({ ...config }));
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
    await storage.removeItem(STORAGE_KEY);
    set({ config: DEFAULT_CONFIG, isConnected: false, error: null });
  },

  clearError: () => set({ error: null }),
}));

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
