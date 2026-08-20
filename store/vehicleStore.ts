import { create } from 'zustand';
import { Vehicle } from '@/types';
import { storage } from '@/utils/storage';
import { useAuthStore } from './authStore';
import {
  fetchVehiclesFromSupabase,
  syncVehiclesToSupabase,
  addVehicleToSupabase,
  updateVehicleInSupabase,
  deleteVehicleFromSupabase,
  hasSupabaseEnv,
} from '@/utils/fleetSync';
import { useGps808Store, GpsDeviceStatusCache, GpsDeviceStatusType } from './gps808Store';
import { fetchGpsVehicles, gps808Api } from './gps808Store';

/**
 * 依目前登入使用者角色過濾車輛：
 * - admin：看到所有車輛
 * - company：只看到擁有者為自己的車輛
 * - driver / user：只看到擁有者為自己的車輛（與 company 邏輯一致）
 */
function filterVehiclesByOwner(vehicles: Vehicle[]): Vehicle[] {
  const { user, role } = useAuthStore.getState();
  if (role === 'admin' || !user) {
    return vehicles;
  }
  return vehicles.filter((v) => v.ownerId === user.id);
}

const LOCAL_STORAGE_KEY = 'vehicles_v_legacy'; // 保留舊本地 key

interface VehicleState {
  vehicles: Vehicle[];
  isLoading: boolean;
  isSyncing: boolean;
  syncError: string | null;
  searchQuery: string;
  statusFilter: string;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: string) => void;
  loadVehicles: () => Promise<void>;
  syncVehicles: () => Promise<void>;
  addVehicle: (vehicle: Omit<Vehicle, 'id' | 'createdAt'>) => Promise<Vehicle>;
  updateVehicle: (id: string, updates: Partial<Vehicle>) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  getVehicleById: (id: string) => Vehicle | undefined;
  getFilteredVehicles: () => Vehicle[];
}

const generateId = () => `v${Date.now()}`;

// 從本地存儲遷移舊數據到 Supabase
async function migrateLocalVehicles(): Promise<Vehicle[]> {
  try {
    const stored = await storage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const localVehicles: Vehicle[] = JSON.parse(stored);
      if (Array.isArray(localVehicles) && localVehicles.length > 0) {
        console.log(`[VehicleStore] 找到 ${localVehicles.length} 輛本地車輛，正在遷移到 Supabase...`);
        await syncVehiclesToSupabase(localVehicles);
        console.log('[VehicleStore] 本地車輛已遷移到 Supabase');
        return localVehicles;
      }
    }
  } catch (err) {
    console.error('[VehicleStore] 遷移本地車輛失敗:', err);
  }
  return [];
}

export const useVehicleStore = create<VehicleState>((set, get) => ({
  vehicles: [],
  isLoading: true,
  isSyncing: false,
  syncError: null,
  searchQuery: '',
  statusFilter: 'all',

  setSearchQuery: (query) => set({ searchQuery: query }),
  setStatusFilter: (status) => set({ statusFilter: status }),

  loadVehicles: async () => {
    try {
      set({ isLoading: true, syncError: null });

      // 如果有 Supabase，從雲端讀取
      if (hasSupabaseEnv) {
        try {
          let vehicles = await fetchVehiclesFromSupabase();

          // 如果雲端為空，嘗試遷移本地數據
          if (vehicles.length === 0) {
            const localVehicles = await migrateLocalVehicles();
            if (localVehicles.length > 0) {
              vehicles = localVehicles;
            }
          }

          // GPS 合併
          const gpsStore = useGps808Store.getState();
          if (gpsStore.isConnected) {
            const gpsVehicles = await fetchGpsVehicles();
            if (gpsVehicles.length > 0) {
              const mappedGpsVehicles: Vehicle[] = gpsVehicles.map((gv, index) => ({
                id: gv.devIdno || `gps-${index}`,
                make: gv.companyName || 'GPS Device',
                model: gv.plateType ? `Type ${gv.plateType}` : 'Unknown',
                plateNumber: gv.vehiIdno || 'Unknown',
                color: 'N/A',
                year: 2024,
                vin: gv.devIdno || '',
                status: gv.onlineStatus === 1 ? 'active' : 'inactive',
                gpsDeviceId: gv.devIdno,
                devIdno: gv.devIdno,
                createdAt: new Date().toISOString(),
                imageUrl: '',
              }));

              const localGpsIds = new Set(mappedGpsVehicles.map((v) => v.gpsDeviceId));
              const uniqueVehicles = vehicles.filter(
                (v) => !v.gpsDeviceId || !localGpsIds.has(v.gpsDeviceId)
              );
              vehicles = [...mappedGpsVehicles, ...uniqueVehicles];
            }
          }

          set({ vehicles, isLoading: false });
          return;
        } catch (err) {
          console.error('[VehicleStore] Supabase 讀取失敗:', err);
          set({ syncError: '無法連接到雲端服務' });
          // Fall through 到本地存儲
        }
      }

      // 沒有 Supabase 或讀取失敗，使用本地存儲
      const stored = await storage.getItem(LOCAL_STORAGE_KEY);
      let localVehicles: Vehicle[] = [];
      if (stored) {
        localVehicles = JSON.parse(stored);
      }
      set({ vehicles: localVehicles, isLoading: false });
    } catch {
      set({ vehicles: [], isLoading: false });
    }
  },

  syncVehicles: async () => {
    if (!hasSupabaseEnv) {
      return;
    }

    // 如果有同步錯誤，不要執行 sync（避免覆蓋雲端數據）
    if (get().syncError) {
      console.log('[VehicleStore] 有同步錯誤，跳過 syncVehicles');
      return;
    }

    const vehicles = get().vehicles;
    if (vehicles.length === 0) {
      console.log('[VehicleStore] 沒有車輛需要同步');
      return;
    }

    set({ isSyncing: true, syncError: null });
    try {
      await syncVehiclesToSupabase(vehicles);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Vehicle sync failed';
      console.error('[VehicleStore] syncVehicles 失敗:', message);
      set({ syncError: message });
    } finally {
      set({ isSyncing: false });
    }
  },

  addVehicle: async (vehicleData) => {
    const newVehicle: Vehicle = {
      ...vehicleData,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };

    // 先更新本地狀態
    const updated = [...get().vehicles, newVehicle];
    set({ vehicles: updated });

    // 同步到 Supabase
    if (hasSupabaseEnv) {
      try {
        await addVehicleToSupabase(newVehicle);
      } catch (err) {
        console.error('[VehicleStore] addVehicle 到 Supabase 失敗:', err);
        set({ syncError: '車輛已添加但同步失敗' });
      }
    }

    return newVehicle;
  },

  updateVehicle: async (id, updates) => {
    const updated = get().vehicles.map((v) =>
      v.id === id ? { ...v, ...updates } : v
    );
    set({ vehicles: updated });

    if (hasSupabaseEnv) {
      try {
        await updateVehicleInSupabase(id, updates);
      } catch (err) {
        console.error('[VehicleStore] updateVehicle 到 Supabase 失敗:', err);
        set({ syncError: '車輛已更新但同步失敗' });
      }
    }
  },

  deleteVehicle: async (id) => {
    const updated = get().vehicles.filter((v) => v.id !== id);
    set({ vehicles: updated });

    if (hasSupabaseEnv) {
      try {
        await deleteVehicleFromSupabase(id);
      } catch (err) {
        console.error('[VehicleStore] deleteVehicle 到 Supabase 失敗:', err);
        set({ syncError: '車輛已刪除但同步失敗' });
      }
    }
  },

  getVehicleById: (id) => get().vehicles.find((v) => v.id === id),

  getFilteredVehicles: () => {
    const { vehicles, searchQuery, statusFilter } = get();
    let filtered = filterVehiclesByOwner(vehicles);

    if (statusFilter !== 'all') {
      filtered = filtered.filter((v) => v.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          v.make.toLowerCase().includes(q) ||
          v.model.toLowerCase().includes(q) ||
          v.plateNumber.toLowerCase().includes(q) ||
          v.color.toLowerCase().includes(q)
      );
    }

    return filtered;
  },
}));
