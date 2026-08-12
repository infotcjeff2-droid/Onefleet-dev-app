import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { hashApiKey, maskApiKey } from '@/utils/secureHash';
import { useAuthStore } from './authStore';
import { hasSupabaseEnv } from '@/utils/supabase';
import { syncRouteConfig, getRouteConfigSync, clearRouteConfigSync } from '@/utils/fleetSync';
import type { 
  RouteSystemConfig, 
  RouteProvider, 
  RouteStrategy, 
  StartLocationMode, 
  EndLocationMode 
} from '@/types';

interface RouteConfigState {
  config: RouteSystemConfig;
  isLoading: boolean;
  isSaving: boolean;
  isConfigured: boolean;
  /** 載入設定 */
  loadConfig: () => Promise<void>;
  /** 儲存 API Key */
  saveApiKey: (apiKey: string, provider: RouteProvider) => Promise<void>;
  /** 儲存線路策略設定 */
  saveStrategyConfig: (config: Partial<RouteSystemConfig>) => Promise<void>;
  /** 清除所有設定 */
  clearConfig: () => Promise<void>;
  /** 測試 API 連線 */
  testApiConnection: (apiKey: string, provider: RouteProvider) => Promise<boolean>;
}

const DEFAULT_CONFIG: RouteSystemConfig = {
  provider: 'google',
  apiKeyHash: '',
  apiKeyMasked: '',
  hasApiKey: false,
  defaultStrategy: 'fastest',
  enableTspOptimization: true,
  defaultStartLocation: 'driver_gps',
  defaultEndLocation: 'last_task_destination',
  depotAddress: '',
  avoidTolls: false,
  avoidHighways: false,
  considerTraffic: true,
};

function getStorageKey(): string {
  const userId = useAuthStore.getState().user?.id ?? 'guest';
  return `route_system_config_${userId}`;
}

export const useRouteConfigStore = create<RouteConfigState>((set, get) => ({
  config: DEFAULT_CONFIG,
  isLoading: true,
  isSaving: false,
  isConfigured: false,

  loadConfig: async () => {
    set({ isLoading: true });
    try {
      // 首先從本地存儲載入
      const stored = await storage.getItem(getStorageKey());
      if (stored) {
        const parsed = JSON.parse(stored) as RouteSystemConfig;
        set({ 
          config: parsed, 
          isConfigured: parsed.hasApiKey ?? false, 
          isLoading: false 
        });
      } else {
        set({ isLoading: false });
      }

      // 如果有 Supabase 環境，從雲端同步設定
      if (hasSupabaseEnv) {
        const cloudConfig = await getRouteConfigSync();
        if (cloudConfig) {
          const mergedConfig: RouteSystemConfig = {
            provider: cloudConfig.provider as RouteProvider,
            apiKeyHash: cloudConfig.api_key_hash || undefined,
            apiKeyMasked: cloudConfig.api_key_masked || undefined,
            hasApiKey: !!cloudConfig.api_key_hash,
            defaultStrategy: cloudConfig.default_strategy as RouteStrategy,
            enableTspOptimization: cloudConfig.enable_tsp_optimization,
            defaultStartLocation: cloudConfig.default_start_location as StartLocationMode,
            defaultEndLocation: cloudConfig.default_end_location as EndLocationMode,
            depotAddress: cloudConfig.depot_address || undefined,
            depotCoords: cloudConfig.depot_coords || undefined,
            avoidTolls: cloudConfig.avoid_tolls,
            avoidHighways: cloudConfig.avoid_highways,
            considerTraffic: cloudConfig.consider_traffic,
          };
          // 合併雲端設定到本地
          await storage.setItem(getStorageKey(), JSON.stringify(mergedConfig));
          set({ config: mergedConfig, isConfigured: mergedConfig.hasApiKey ?? false });
        }
      }
    } catch {
      set({ isLoading: false });
    }
  },

  saveApiKey: async (apiKey: string, provider: RouteProvider) => {
    set({ isSaving: true });
    try {
      const hash = hashApiKey(apiKey);
      const masked = maskApiKey(apiKey);
      const newConfig: RouteSystemConfig = {
        ...get().config,
        provider,
        apiKeyHash: hash,
        apiKeyMasked: masked,
        hasApiKey: true,
      };
      await storage.setItem(getStorageKey(), JSON.stringify(newConfig));
      set({ config: newConfig, isConfigured: true, isSaving: false });

      // 同步到雲端
      if (hasSupabaseEnv) {
        await syncRouteConfig({
          provider,
          apiKeyHash: hash,
          apiKeyMasked: masked,
        });
      }
    } catch {
      set({ isSaving: false });
    }
  },

  saveStrategyConfig: async (updates: Partial<RouteSystemConfig>) => {
    set({ isSaving: true });
    try {
      const newConfig: RouteSystemConfig = {
        ...get().config,
        ...updates,
      };
      await storage.setItem(getStorageKey(), JSON.stringify(newConfig));
      set({ config: newConfig, isSaving: false });

      // 同步到雲端
      if (hasSupabaseEnv) {
        await syncRouteConfig({
          provider: updates.provider || get().config.provider,
          defaultStrategy: updates.defaultStrategy,
          enableTspOptimization: updates.enableTspOptimization,
          defaultStartLocation: updates.defaultStartLocation,
          defaultEndLocation: updates.defaultEndLocation,
          depotAddress: updates.depotAddress,
          avoidTolls: updates.avoidTolls,
          avoidHighways: updates.avoidHighways,
          considerTraffic: updates.considerTraffic,
        });
      }
    } catch {
      set({ isSaving: false });
    }
  },

  clearConfig: async () => {
    await storage.removeItem(getStorageKey());
    set({ config: DEFAULT_CONFIG, isConfigured: false });

    // 清除雲端設定
    if (hasSupabaseEnv) {
      await clearRouteConfigSync();
    }
  },

  testApiConnection: async (apiKey: string, provider: RouteProvider) => {
    try {
      // 根據不同的 provider 測試 API 連線
      switch (provider) {
        case 'google': {
          // 測試 Google Maps API
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=TST,Hong+Kong&key=${apiKey}`
          );
          return response.ok;
        }
        case 'mapbox': {
          // 測試 Mapbox API
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/HongKong.json?access_token=${apiKey}`
          );
          return response.ok;
        }
        case 'osrm': {
          // OSRM 是公開 API，無需 API Key
          const response = await fetch(
            'https://router.project-osrm.org/route/v1/driving/114.169,22.303;114.177,22.312'
          );
          const data = await response.json();
          return data.code === 'Ok';
        }
        default:
          return false;
      }
    } catch {
      return false;
    }
  },
}));

// 便捷的設定值枚舉
export const ROUTE_PROVIDERS: { value: RouteProvider; label: string }[] = [
  { value: 'google', label: 'Google Maps Platform' },
  { value: 'mapbox', label: 'Mapbox' },
  { value: 'osrm', label: 'OpenStreetMap (OSRM)' },
];

export const ROUTE_STRATEGIES: { value: RouteStrategy; label: string; labelZh: string }[] = [
  { value: 'fastest', label: 'Fastest', labelZh: '最快時間' },
  { value: 'shortest', label: 'Shortest Distance', labelZh: '最短距離' },
  { value: 'balanced', label: 'Balanced', labelZh: '平衡模式' },
];

export const START_LOCATION_MODES: { value: StartLocationMode; label: string; labelZh: string }[] = [
  { value: 'driver_gps', label: 'Current GPS', labelZh: '司機目前位置' },
  { value: 'depot', label: 'Depot / HQ', labelZh: '車隊總部/倉庫' },
  { value: 'first_task_origin', label: 'First Task Origin', labelZh: '第一個任務起點' },
];

export const END_LOCATION_MODES: { value: EndLocationMode; label: string; labelZh: string }[] = [
  { value: 'depot', label: 'Return to Depot', labelZh: '返回車隊總部' },
  { value: 'last_task_destination', label: 'Last Task Destination', labelZh: '最後任務目的地' },
  { value: 'unlimited', label: 'No Fixed End', labelZh: '不限定終點' },
];
