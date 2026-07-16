import { create } from 'zustand';
import { Vehicle } from '@/types';
import { storage } from '@/utils/storage';
import { fetchFleetSnapshot, hasSupabaseEnv, pushFleetSnapshot } from '@/utils/fleetSync';
import { mockVehicles } from '@/constants/mockData';
import { useGps808Store } from './gps808Store';
import { fetchGpsVehicles } from './gps808Store';
import { useAuthStore } from './authStore';

const STORAGE_KEY = 'vehicles';

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

async function persistVehicles(vehicles: Vehicle[]) {
  await storage.setItem(STORAGE_KEY, JSON.stringify(vehicles));
}

function pushVehiclesInBackground(vehicles: Vehicle[], onError: (message: string) => void) {
  if (!hasSupabaseEnv) {
    return;
  }

  void pushFleetSnapshot({ vehicles }).catch((err) => {
    onError(err instanceof Error ? err.message : 'Vehicle sync failed');
  });
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
      // 優先從 GPS 808 系統獲取車輛列表（如果已連接）
      const gpsStore = useGps808Store.getState();
      if (gpsStore.isConnected) {
        const gpsVehicles = await fetchGpsVehicles();
        if (gpsVehicles.length > 0) {
          const currentUser = useAuthStore.getState().user;
          // 將 GPS 車輛轉換為本地格式
          const mappedVehicles: Vehicle[] = gpsVehicles.map((gv, index) => ({
            id: gv.devIdno || `gps-${index}`,
            make: gv.companyName || 'GPS Device',
            model: gv.plateType ? `Type ${gv.plateType}` : 'Unknown',
            plateNumber: gv.vehiIdno || 'Unknown',
            color: 'N/A',
            year: 2024,
            vin: gv.devIdno || '',
            status: gv.onlineStatus === 1 ? 'active' : 'inactive',
            gpsDeviceId: gv.devIdno,
            createdAt: new Date().toISOString(),
            imageUrl: '',
            userId: currentUser?.id,
          }));
          set({ vehicles: mappedVehicles, isLoading: false });
          await persistVehicles(mappedVehicles);
          return;
        }
      }

      // 否則從本地存儲讀取，並根據 userId 過濾
      const currentUser = useAuthStore.getState().user;
      const stored = await storage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // 如果有 userId，過濾顯示該用戶的車輛
        const userVehicles = currentUser?.id
          ? parsed.filter((v: Vehicle) => !v.userId || v.userId === currentUser.id)
          : parsed;
        // 如果存儲的數據為空或車輛數為0，使用 mockVehicles
        if (userVehicles.length === 0) {
          set({ vehicles: mockVehicles, isLoading: false });
          await persistVehicles(mockVehicles);
        } else {
          set({ vehicles: userVehicles, isLoading: false });
        }
      } else {
        // 首次載入，使用 mockVehicles
        set({ vehicles: mockVehicles, isLoading: false });
        await persistVehicles(mockVehicles);
      }
    } catch {
      set({ vehicles: [], isLoading: false });
    }
  },

  syncVehicles: async () => {
    if (!hasSupabaseEnv) {
      return;
    }

    set({ isSyncing: true, syncError: null });
    try {
      const remote = await fetchFleetSnapshot();
      const currentUser = useAuthStore.getState().user;
      if (remote) {
        // 只同步該用戶的車輛
        const userVehicles = currentUser?.id
          ? remote.vehicles.filter((v) => !v.userId || v.userId === currentUser.id)
          : remote.vehicles;
        set({ vehicles: userVehicles });
        await persistVehicles(userVehicles);
      } else {
        const localVehicles = get().vehicles;
        await persistVehicles(localVehicles);
        await pushFleetSnapshot({ vehicles: localVehicles });
      }
    } catch (err) {
      set({ syncError: err instanceof Error ? err.message : 'Vehicle sync failed' });
    } finally {
      set({ isSyncing: false });
    }
  },

  addVehicle: async (vehicleData) => {
    const currentUser = useAuthStore.getState().user;
    const newVehicle: Vehicle = {
      ...vehicleData,
      id: generateId(),
      createdAt: new Date().toISOString(),
      userId: currentUser?.id,
    };
    const updated = [...get().vehicles, newVehicle];
    set({ vehicles: updated });
    await persistVehicles(updated);
    pushVehiclesInBackground(updated, (message) => set({ syncError: message }));
    return newVehicle;
  },

  updateVehicle: async (id, updates) => {
    const updated = get().vehicles.map((v) => (v.id === id ? { ...v, ...updates } : v));
    set({ vehicles: updated });
    await persistVehicles(updated);
    pushVehiclesInBackground(updated, (message) => set({ syncError: message }));
  },

  deleteVehicle: async (id) => {
    const updated = get().vehicles.filter((v) => v.id !== id);
    set({ vehicles: updated });
    await persistVehicles(updated);
    pushVehiclesInBackground(updated, (message) => set({ syncError: message }));
  },

  getVehicleById: (id) => get().vehicles.find((v) => v.id === id),

  getFilteredVehicles: () => {
    const { vehicles, searchQuery, statusFilter } = get();
    let filtered = vehicles;

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
