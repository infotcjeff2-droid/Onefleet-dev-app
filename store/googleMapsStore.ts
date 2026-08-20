import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { hashApiKey, maskApiKey, verifyApiKey } from '@/utils/secureHash';
import { useAuthStore } from './authStore';
import {
  fetchGoogleMapsSharedConfig,
  upsertGoogleMapsSharedConfig,
  clearGoogleMapsSharedConfig,
} from '@/utils/googleMapsSharedSupabase';

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
  /** 取得目前 API Key 明文（供地圖元件載入 SDK 使用） */
  getApiKey: () => string | null;
}

const DEFAULT_CONFIG: GoogleMapsConfig = {
  apiKeyHash: '',
  apiKeyMasked: '',
  hasApiKey: false,
};

/** 共用配置的本機快取 key（不再以 user 區分） */
const SHARED_LOCAL_CACHE_KEY = 'google_maps_shared_config';

/** 內存中保存解 hash 後的明文 API Key，僅供目前 session 使用 */
let _cachedPlainApiKey: string | null = null;

/** 判斷當前使用者是否為管理員 */
function isAdminUser(): boolean {
  return useAuthStore.getState().user?.id === 'u-admin';
}

export const useGoogleMapsStore = create<GoogleMapsState>((set, get) => ({
  config: DEFAULT_CONFIG,
  isLoading: true,
  isSaving: false,
  isConfigured: false,

  loadConfig: async () => {
    set({ isLoading: true });
    try {
      let parsed: GoogleMapsConfig | null = null;

      // 1) 優先從 Supabase 共用單列讀取
      try {
        const cloudConfig = await fetchGoogleMapsSharedConfig();
        if (cloudConfig && cloudConfig.has_api_key) {
          parsed = {
            apiKeyHash: cloudConfig.api_key_hash,
            apiKeyMasked: cloudConfig.api_key_masked,
            hasApiKey: cloudConfig.has_api_key,
          };
          // 重要：從雲端拉到後，清掉本機暫存的明文（避免多裝置不同步）
          _cachedPlainApiKey = null;
        }
      } catch (e) {
        console.log('[googleMapsStore] Supabase fetch failed, fallback to localStorage', e);
      }

      // 2) 回退到本機快取
      if (!parsed) {
        const stored = await storage.getItem(SHARED_LOCAL_CACHE_KEY);
        if (stored) {
          try {
            parsed = JSON.parse(stored) as GoogleMapsConfig;
          } catch (e) {
            console.log('[googleMapsStore] localStorage parse failed', e);
          }
        }
      }

      if (parsed) {
        set({ config: parsed, isConfigured: parsed.hasApiKey, isLoading: false });
      } else {
        set({ config: DEFAULT_CONFIG, isConfigured: false, isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  saveConfig: async (apiKey: string) => {
    if (!isAdminUser()) {
      console.warn('[googleMapsStore] saveConfig blocked: only admin can modify shared config');
      return;
    }
    set({ isSaving: true });
    try {
      const hash = hashApiKey(apiKey);
      const masked = maskApiKey(apiKey);
      const config: GoogleMapsConfig = {
        apiKeyHash: hash,
        apiKeyMasked: masked,
        hasApiKey: true,
      };

      // 寫入本機快取
      await storage.setItem(SHARED_LOCAL_CACHE_KEY, JSON.stringify(config));
      // 同步到 Supabase 共用單列
      await upsertGoogleMapsSharedConfig(
        {
          api_key_hash: hash,
          api_key_masked: masked,
          has_api_key: true,
        },
        'u-admin'
      );

      // 暫存明文供本次 session 使用
      _cachedPlainApiKey = apiKey;

      set({ config, isConfigured: true, isSaving: false });
    } catch {
      set({ isSaving: false });
    }
  },

  clearConfig: async () => {
    if (!isAdminUser()) {
      console.warn('[googleMapsStore] clearConfig blocked: only admin can modify shared config');
      return;
    }
    await storage.removeItem(SHARED_LOCAL_CACHE_KEY);
    await clearGoogleMapsSharedConfig('u-admin');
    _cachedPlainApiKey = null;
    set({ config: DEFAULT_CONFIG, isConfigured: false });
  },

  verifyApiKey: (apiKey: string) => {
    const { config } = get();
    if (!config.hasApiKey) return false;
    return verifyApiKey(apiKey, config.apiKeyHash);
  },

  /**
   * 取得目前 API Key 明文（供地圖元件使用）
   * - 管理員剛設定時會暫存在記憶體中
   * - 其他使用者需要透過別的機制取得（例如 admin 透過安全管道分享，或環境變數注入）
   *
   * 注意：因為 Google Maps JS API 是瀏覽器前端呼叫，
   * 一般使用者若需要使用，需在客戶端有辦法取得明文 key。
   * 這裡我們暫存「本次 session admin 設定的明文」供同瀏覽器使用。
   */
  getApiKey: () => {
    return _cachedPlainApiKey;
  },
}));
