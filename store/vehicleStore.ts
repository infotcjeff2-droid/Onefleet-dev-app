import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Vehicle } from '@/types';
import { mockVehicles } from '@/constants/mockData';

const STORAGE_KEY = 'vehicles';

interface VehicleState {
  vehicles: Vehicle[];
  isLoading: boolean;
  searchQuery: string;
  statusFilter: string;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: string) => void;
  loadVehicles: () => Promise<void>;
  addVehicle: (vehicle: Omit<Vehicle, 'id' | 'createdAt'>) => Promise<Vehicle>;
  updateVehicle: (id: string, updates: Partial<Vehicle>) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  getVehicleById: (id: string) => Vehicle | undefined;
  getFilteredVehicles: () => Vehicle[];
}

const generateId = () => `v${Date.now()}`;

export const useVehicleStore = create<VehicleState>((set, get) => ({
  vehicles: [],
  isLoading: true,
  searchQuery: '',
  statusFilter: 'all',

  setSearchQuery: (query) => set({ searchQuery: query }),
  setStatusFilter: (status) => set({ statusFilter: status }),

  loadVehicles: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        set({ vehicles: JSON.parse(stored), isLoading: false });
      } else {
        set({ vehicles: mockVehicles, isLoading: false });
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mockVehicles));
      }
    } catch {
      set({ vehicles: mockVehicles, isLoading: false });
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
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newVehicle;
  },

  updateVehicle: async (id, updates) => {
    const updated = get().vehicles.map((v) =>
      v.id === id ? { ...v, ...updates } : v
    );
    set({ vehicles: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  deleteVehicle: async (id) => {
    const updated = get().vehicles.filter((v) => v.id !== id);
    set({ vehicles: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  getVehicleById: (id) => {
    return get().vehicles.find((v) => v.id === id);
  },

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
