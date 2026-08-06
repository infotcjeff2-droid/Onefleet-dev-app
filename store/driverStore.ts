import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { hasSupabaseEnv, pushFleetSnapshot, hardDeleteUserProfile } from '@/utils/fleetSync';
import { useAuthStore } from './authStore';

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
  userId?: string;
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
  addDriver: (name: string, phone: string, email: string, vehiclePlate?: string, avatar?: string, companyId?: string, userId?: string) => Promise<Driver>;
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

      // managed_drivers 為「司機清單」的單一真相來源；managed_users 只用於
      // 同步「公司歸屬」(companyId) 等欄位,絕對不會把 managed_users 中的
      // role='driver' 重新插入 managed_drivers（否則刪除後又會復活）。
      let merged: Driver[] = [...filtered];
      const currentUser = useAuthStore.getState().user;
      if (storedUsers) {
        const parsedUsers: StoredUser[] = JSON.parse(storedUsers);
        const driverUsers = parsedUsers.filter((user) => user.role === 'driver');

        for (const userDriver of driverUsers) {
          const existingIndex = merged.findIndex(
            (driver) => driver.email.toLowerCase() === userDriver.email.toLowerCase()
          );
          if (existingIndex !== -1) {
            // 只更新已存在司機的 companyId（以 managed_users 為準）
            if (userDriver.companyId !== undefined) {
              merged[existingIndex] = { ...merged[existingIndex], companyId: userDriver.companyId };
            }
          }
          // 重要：不再 push 新 driver，避免「刪除後又再出現」
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

      // 只保留屬於目前使用者的司機（同時過濾啞資料）
      const userDrivers = deduped.filter(
        (d) =>
          !defaultDriverIds.has(d.id) &&
          (!currentUser?.id || !d.userId || d.userId === currentUser.id)
      );

      set({ drivers: userDrivers });
      await storage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(deduped));
    } catch {
      set({ drivers: defaultDrivers });
    }
  },

  addDriver: async (name, phone, email, vehiclePlate, avatar, companyId) => {
    const id = `d${String(Date.now()).slice(-6)}`;
    const currentUser = useAuthStore.getState().user;
    const newDriver: Driver = {
      id,
      name,
      phone,
      email: email ?? '',
      vehiclePlate,
      status: 'available',
      avatar,
      companyId,
      userId: currentUser?.id,
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

  /**
   * 刪除司機：從 drivers 陣列移除、寫入 storage，並從 Supabase user_profile 表
   * 真刪除（drivers 在雲端是以 role='driver' 的 user_profile 記錄儲存）。
   * 這樣 syncUsers / 重新整理頁面時,被刪的司機不會再從雲端被拉回來。
   */
  deleteDriver: async (id) => {
    const updated = get().drivers.filter((driver) => driver.id !== id);
    set({ drivers: updated });
    await storage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(updated));
    if (hasSupabaseEnv) {
      try {
        await hardDeleteUserProfile(id);
      } catch (err) {
        console.warn('[driverStore] hardDeleteUserProfile failed:', err);
      }
    }
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
