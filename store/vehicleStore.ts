import { create } from 'zustand';
import { Vehicle } from '@/types';
import { storage } from '@/utils/storage';
import { fetchFleetSnapshot, hasSupabaseEnv, pushFleetSnapshot } from '@/utils/fleetSync';

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
      const stored = await storage.getItem(STORAGE_KEY);
      if (stored) {
        set({ vehicles: JSON.parse(stored), isLoading: false });
      } else {
        set({ vehicles: [], isLoading: false });
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
      if (remote) {
        set({ vehicles: remote.vehicles });
        await persistVehicles(remote.vehicles);
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
    const newVehicle: Vehicle = {
      ...vehicleData,
      id: generateId(),
      createdAt: new Date().toISOString(),
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
