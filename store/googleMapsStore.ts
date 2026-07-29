import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { hashApiKey, maskApiKey, verifyApiKey } from '@/utils/secureHash';
import { useAuthStore } from './authStore';

interface GoogleMapsConfig {
  apiKeyHash: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
}

interface GoogleMapsState {
  config: GoogleMapsConfig;
  isLoading: boolean;
  isSaving: boolean;
  isConfigured: boolean;
  loadConfig: () => Promise<void>;
  saveConfig: (apiKey: string) => Promise<void>;
  clearConfig: () => Promise<void>;
  verifyApiKey: (apiKey: string) => boolean;
}

const DEFAULT_CONFIG: GoogleMapsConfig = {
  apiKeyHash: '',
  apiKeyMasked: '',
  hasApiKey: false,
};

function getStorageKey(): string {
  const userId = useAuthStore.getState().user?.id ?? 'guest';
  return `google_maps_config_${userId}`;
}

export const useGoogleMapsStore = create<GoogleMapsState>((set, get) => ({
  config: DEFAULT_CONFIG,
  isLoading: true,
  isSaving: false,
  isConfigured: false,

  loadConfig: async () => {
    set({ isLoading: true });
    try {
      const stored = await storage.getItem(getStorageKey());
      if (stored) {
        const parsed = JSON.parse(stored) as GoogleMapsConfig;
        set({ config: parsed, isConfigured: parsed.hasApiKey, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  saveConfig: async (apiKey: string) => {
    set({ isSaving: true });
    try {
      const hash = hashApiKey(apiKey);
      const masked = maskApiKey(apiKey);
      const config: GoogleMapsConfig = {
        apiKeyHash: hash,
        apiKeyMasked: masked,
        hasApiKey: true,
      };
      await storage.setItem(getStorageKey(), JSON.stringify(config));
      set({ config, isConfigured: true, isSaving: false });
    } catch {
      set({ isSaving: false });
    }
  },

  clearConfig: async () => {
    await storage.removeItem(getStorageKey());
    set({ config: DEFAULT_CONFIG, isConfigured: false });
  },

  verifyApiKey: (apiKey: string) => {
    const { config } = get();
    if (!config.hasApiKey) return false;
    return verifyApiKey(apiKey, config.apiKeyHash);
  },
}));
