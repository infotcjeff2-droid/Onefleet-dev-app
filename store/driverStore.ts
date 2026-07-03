import { create } from 'zustand';
import { storage } from '@/utils/storage';

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehiclePlate?: string;
  status: 'available' | 'busy' | 'offline';
  avatar?: string;
  /** 綁定的車輛 ID */
  assignedVehicleId?: string;
}

const DRIVER_STORAGE_KEY = 'managed_drivers';
const USER_STORAGE_KEY = 'managed_users';

interface StoredDriver {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehiclePlate?: string;
  status: 'available' | 'busy' | 'offline';
  avatar?: string;
  assignedVehicleId?: string;
}

interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: 'driver' | 'company' | 'admin';
  phone?: string;
  avatar?: string;
}

const defaultDrivers: Driver[] = [
  { id: 'd001', name: '陳大文', phone: '+852 6123 4567', email: 'chan.daiman@example.com', vehiclePlate: 'CA 1234', status: 'available', assignedVehicleId: 'v001' },
  { id: 'd002', name: '王小明', phone: '+852 9876 5432', email: 'wong.sioming@example.com', vehiclePlate: 'XX 5678', status: 'busy', assignedVehicleId: 'v002' },
  { id: 'd003', name: '張志偉', phone: '+852 5555 1234', email: 'cheung.chiwai@example.com', vehiclePlate: 'EV 0001', status: 'available', assignedVehicleId: 'v003' },
  { id: 'd004', name: '李國強', phone: '+852 6888 9999', email: 'li.kwokeung@example.com', vehiclePlate: 'TH 8899', status: 'available', assignedVehicleId: 'v008' },
];

interface DriverState {
  drivers: Driver[];
  loadDrivers: () => Promise<void>;
  addDriver: (name: string, phone: string, email: string, vehiclePlate?: string, avatar?: string) => Promise<Driver>;
  updateDriver: (id: string, updates: Partial<Driver>) => Promise<void>;
  deleteDriver: (id: string) => Promise<void>;
  getDriverById: (id: string) => Driver | undefined;
  /** 獲取綁定到指定司機的車輛 */
  getVehiclesByDriverId: (driverId: string, vehicles: { id: string; assignedDriverId?: string; plateNumber: string }[]) => { id: string; plateNumber: string }[];
}

export const useDriverStore = create<DriverState>((set, get) => ({
  drivers: defaultDrivers,

  loadDrivers: async () => {
    try {
      const [storedDrivers, storedUsers] = await Promise.all([
        storage.getItem(DRIVER_STORAGE_KEY),
        storage.getItem(USER_STORAGE_KEY),
      ]);

      let merged: Driver[] = [...defaultDrivers];

      if (storedDrivers) {
        const parsedDrivers: StoredDriver[] = JSON.parse(storedDrivers);
        merged = parsedDrivers.map((driver) => {
          if (driver.email === undefined || driver.email === '') {
            const hasAt = driver.phone && driver.phone.includes('@');
            return {
              ...driver,
              email: hasAt ? driver.phone : '',
              phone: hasAt ? '' : (driver.phone ?? ''),
            };
          }
          return driver;
        });
      }

      if (storedUsers) {
        const parsedUsers: StoredUser[] = JSON.parse(storedUsers);
        const userDrivers: Driver[] = parsedUsers
          .filter((user) => user.role === 'driver')
          .map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone ?? '',
            vehiclePlate: '',
            status: 'available' as const,
            avatar: user.avatar,
          }));

        for (const userDriver of userDrivers) {
          if (!merged.some((driver) => driver.email.toLowerCase() === userDriver.email.toLowerCase())) {
            merged.push(userDriver);
          }
        }
      }

        const seen = new Set<string>();
        const deduped: Driver[] = [];
        for (const d of merged) {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            deduped.push(d);
          }
        }
        set({ drivers: deduped });
        await storage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(deduped));
    } catch {
      set({ drivers: defaultDrivers });
    }
  },

  addDriver: async (name, phone, email, vehiclePlate, avatar) => {
    const id = `d${String(Date.now()).slice(-6)}`;
    const newDriver: Driver = {
      id,
      name,
      phone,
      email: email ?? '',
      vehiclePlate,
      status: 'available',
      avatar,
    };
    const updated = [...get().drivers, newDriver];
    set({ drivers: updated });
    await storage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(updated));
    return newDriver;
  },

  updateDriver: async (id, updates) => {
    const updated = get().drivers.map((driver) =>
      driver.id === id ? { ...driver, ...updates } : driver
    );
    set({ drivers: updated });
    await storage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(updated));
  },

  deleteDriver: async (id) => {
    const updated = get().drivers.filter((driver) => driver.id !== id);
    set({ drivers: updated });
    await storage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(updated));
  },

  getDriverById: (id) => {
    return get().drivers.find((driver) => driver.id === id);
  },

  getVehiclesByDriverId: (driverId, vehicles) => {
    return vehicles.filter((v) => v.assignedDriverId === driverId);
  },
}));
