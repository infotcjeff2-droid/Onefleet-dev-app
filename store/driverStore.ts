import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { hasSupabaseEnv, pushFleetSnapshot } from '@/utils/fleetSync';

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehiclePlate?: string;
  status: 'available' | 'busy' | 'offline';
  avatar?: string;
  assignedVehicleId?: string;
  /** 所屬公司 ID */
  companyId?: string;
}

const DRIVER_STORAGE_KEY = 'managed_drivers';
const USER_STORAGE_KEY = 'managed_users';

/** 硬編碼預設資料，僅從未初始化 storage 時使用 */
const defaultDrivers: Driver[] = [
  { id: 'd001', name: '陳大文', phone: '+852 6123 4567', email: 'chan.daiman@example.com', vehiclePlate: 'CA 1234', status: 'available', assignedVehicleId: 'v001' },
  { id: 'd002', name: '王小明', phone: '+852 9876 5432', email: 'wong.sioming@example.com', vehiclePlate: 'XX 5678', status: 'busy', assignedVehicleId: 'v002' },
  { id: 'd003', name: '張志偉', phone: '+852 5555 1234', email: 'cheung.chiwai@example.com', vehiclePlate: 'EV 0001', status: 'available', assignedVehicleId: 'v003' },
  { id: 'd004', name: '李國強', phone: '+852 6888 9999', email: 'li.kwokeung@example.com', vehiclePlate: 'TH 8899', status: 'available', assignedVehicleId: 'v008' },
];

interface StoredDriver {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehiclePlate?: string;
  status: 'available' | 'busy' | 'offline';
  avatar?: string;
  assignedVehicleId?: string;
  companyId?: string;
}

interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: 'driver' | 'company' | 'admin';
  phone?: string;
  avatar?: string;
  companyId?: string;
}

interface DriverState {
  drivers: Driver[];
  loadDrivers: () => Promise<void>;
  addDriver: (name: string, phone: string, email: string, vehiclePlate?: string, avatar?: string, companyId?: string) => Promise<Driver>;
  updateDriver: (id: string, updates: Partial<Driver>) => Promise<void>;
  deleteDriver: (id: string) => Promise<void>;
  getDriverById: (id: string) => Driver | undefined;
  getVehiclesByDriverId: (driverId: string, vehicles: { id: string; assignedDriverId?: string; plateNumber: string }[]) => { id: string; plateNumber: string }[];
  getDriversByCompanyId: (companyId: string) => Driver[];
}

export const useDriverStore = create<DriverState>((set, get) => ({
  drivers: defaultDrivers,

  loadDrivers: async () => {
    try {
      const [storedDrivers, storedUsers] = await Promise.all([
        storage.getItem(DRIVER_STORAGE_KEY),
        storage.getItem(USER_STORAGE_KEY),
      ]);

      // Migration: 過濾掉殘留的啞資料（defaultDrivers 的 ID），以 storage 為準
      const defaultDriverIds = new Set(['d001', 'd002', 'd003', 'd004']);
      const filtered = (storedDrivers ? JSON.parse(storedDrivers) : []).filter(
        (d: Driver) => !defaultDriverIds.has(d.id)
      );

      // 從 managed_users 同步 driver 角色（已新增但尚未出現在 managed_drivers 的）
      // 同時也更新已存在司機的 companyId（用戶可能在其他地方編輯了司機的公司歸屬）
      let merged: Driver[] = [...filtered];
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
            companyId: user.companyId,
          }));

        for (const userDriver of userDrivers) {
          const existingIndex = merged.findIndex(
            (driver) => driver.email.toLowerCase() === userDriver.email.toLowerCase()
          );
          if (existingIndex !== -1) {
            // 更新已存在司機的 companyId（以 managed_users 為準）
            if (userDriver.companyId !== undefined) {
              merged[existingIndex] = { ...merged[existingIndex], companyId: userDriver.companyId };
            }
          } else {
            merged.push(userDriver);
          }
        }
      }

      // 若 storage 完全是空的，初始化 defaultDrivers（首次使用才需要）
      if (!storedDrivers && !storedUsers) {
        merged = [...defaultDrivers];
      }

      // 去重
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

  addDriver: async (name, phone, email, vehiclePlate, avatar, companyId) => {
    const id = `d${String(Date.now()).slice(-6)}`;
    const newDriver: Driver = {
      id,
      name,
      phone,
      email: email ?? '',
      vehiclePlate,
      status: 'available',
      avatar,
      companyId,
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
    if (hasSupabaseEnv) {
      await pushFleetSnapshot({ users: updated.map((d) => ({ ...d, role: 'driver' as const })) }).catch(() => {});
    }
  },

  /** 刪除司機：從 drivers 陣列移除並寫入 storage（下次 load 不會回來） */
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

  getDriversByCompanyId: (companyId) => {
    return get().drivers.filter((driver) => driver.companyId === companyId);
  },
}));
