import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { gps808Api, setServerUrl } from '@/utils/gps808Api';

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

export const useGps808Store = create<Gps808State>((set, get) => ({
  config: DEFAULT_CONFIG,
  isConnected: false,
  isLoading: true,
  isSaving: false,
  error: null,

  loadConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const stored = await storage.getItem(STORAGE_KEY);
      if (!stored) {
        set({ isLoading: false });
        return;
      }
      const parsed = JSON.parse(stored) as Gps808Config;
      await setServerUrl(parsed.serverUrl);
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
        const result = await gps808Api.login(parsed.account, parsed.password);
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
      await setServerUrl(config.serverUrl);
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
