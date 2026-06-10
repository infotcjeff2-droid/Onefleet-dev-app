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
  { id: 'd001', name: 'John Smith', phone: '+1234567890', email: 'john@example.com', vehiclePlate: 'ABC-1234', status: 'available' },
  { id: 'd002', name: 'Mike Johnson', phone: '+1234567891', email: 'mike@example.com', vehiclePlate: 'XYZ-5678', status: 'busy' },
  { id: 'd003', name: 'David Lee', phone: '+1234567892', email: 'david@example.com', vehiclePlate: 'DEF-9012', status: 'available' },
];

interface DriverState {
  drivers: Driver[];
  loadDrivers: () => Promise<void>;
  addDriver: (name: string, phone: string, email: string, vehiclePlate?: string, avatar?: string) => Promise<Driver>;
  updateDriver: (id: string, updates: Partial<Driver>) => Promise<void>;
  deleteDriver: (id: string) => Promise<void>;
  getDriverById: (id: string) => Driver | undefined;
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

      set({ drivers: merged });
      await storage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(merged));
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
}));
