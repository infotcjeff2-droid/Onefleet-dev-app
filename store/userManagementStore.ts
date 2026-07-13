import { create } from 'zustand';
import { User, UserRole } from '@/types';
import { storage } from '@/utils/storage';
import { fetchFleetSnapshot, hasSupabaseEnv, pushFleetSnapshot } from '@/utils/fleetSync';

const STORAGE_KEY = 'managed_users';

interface ManagedUser extends User {
  password?: string;
}

interface UserManagementState {
  users: ManagedUser[];
  isSyncing: boolean;
  syncError: string | null;
  loadUsers: () => Promise<void>;
  syncUsers: () => Promise<void>;
  addUser: (name: string, email: string, password: string, role: 'driver' | 'company', phone?: string, avatar?: string) => Promise<{ success: boolean; error?: string }>;
  updateUser: (id: string, updates: Partial<Pick<ManagedUser, 'name' | 'email' | 'phone' | 'role' | 'avatar'>>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  getUserByEmail: (email: string) => ManagedUser | undefined;
}

const generateId = (role: UserRole) => {
  if (role === 'driver') return `d${String(Date.now()).slice(-6)}`;
  return `u${String(Date.now()).slice(-6)}`;
};

async function persistUsers(users: ManagedUser[]) {
  await storage.setItem(STORAGE_KEY, JSON.stringify(users));
}

async function pushUsers(users: ManagedUser[]) {
  if (!hasSupabaseEnv) {
    return;
  }

  await pushFleetSnapshot({ users });
}

function pushUsersInBackground(users: ManagedUser[], onError: (message: string) => void) {
  void pushUsers(users).catch((err) => {
    onError(err instanceof Error ? err.message : 'User sync failed');
  });
}

export const useUserManagementStore = create<UserManagementState>((set, get) => ({
  users: [],
  isSyncing: false,
  syncError: null,

  loadUsers: async () => {
    try {
      const stored = await storage.getItem(STORAGE_KEY);
      let users: ManagedUser[] = stored ? JSON.parse(stored) : [];

      // Migration: 如果 storage 已污染（含有 defaultDrivers 的 ID 但未經正常創建流程），
      // 清理掉這些啞資料，讓 users 保持乾淨。
      const defaultDriverIds = ['d001', 'd002', 'd003', 'd004'];
      const migrated = users.filter((u) => !defaultDriverIds.includes(u.id));

      if (migrated.length < users.length) {
        // 有清理動作，才需要重新寫入 storage
        users = migrated;
        await persistUsers(users);
      }

      set({ users });
    } catch {
      set({ users: [] });
    }
  },

  syncUsers: async () => {
    if (!hasSupabaseEnv) {
      return;
    }

    set({ isSyncing: true, syncError: null });
    try {
      const remote = await fetchFleetSnapshot();
      const localUsers = get().users;

      if (remote && Array.isArray(remote.users) && remote.users.length > 0) {
        // 採聯集合並（以 email 為唯一鍵），避免遠端空陣列覆蓋本地、也避免本地剛新增被遠端舊版覆蓋
        const mergedMap = new Map<string, ManagedUser>();
        for (const user of remote.users as ManagedUser[]) {
          if (user?.email) mergedMap.set(user.email.toLowerCase(), user);
        }
        for (const user of localUsers) {
          if (user?.email) mergedMap.set(user.email.toLowerCase(), user);
        }
        const merged = Array.from(mergedMap.values());

        // 若本地比遠端多（剛新增但同步失敗），回寫遠端
        const remoteEmails = new Set(
          (remote.users as ManagedUser[])
            .filter((u) => u?.email)
            .map((u) => u.email.toLowerCase())
        );
        const hasNewLocal = localUsers.some((u) => u.email && !remoteEmails.has(u.email.toLowerCase()));

        set({ users: merged });
        await persistUsers(merged);
        if (hasNewLocal) {
          await pushFleetSnapshot({ users: merged });
        }
      } else if (localUsers.length > 0) {
        // 遠端沒有資料，把本地推上去
        await persistUsers(localUsers);
        await pushFleetSnapshot({ users: localUsers });
      }
    } catch (err) {
      set({ syncError: err instanceof Error ? err.message : 'User sync failed' });
    } finally {
      set({ isSyncing: false });
    }
  },

  addUser: async (name, email, password, role, phone, avatar) => {
    const existing = get().users.find((user) => user.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return { success: false, error: 'Email already registered' };
    }

    const newUser: ManagedUser = {
      id: generateId(role),
      name,
      email,
      password,
      role,
      phone,
      avatar,
    };

    const updated = [...get().users, newUser];
    set({ users: updated });
    await persistUsers(updated);
    pushUsersInBackground(updated, (message) => set({ syncError: message }));
    return { success: true };
  },

  updateUser: async (id, updates) => {
    const updated = get().users.map((user) => (user.id === id ? { ...user, ...updates } : user));
    set({ users: updated });
    await persistUsers(updated);
    pushUsersInBackground(updated, (message) => set({ syncError: message }));
  },

  /**
   * 軟刪除：把使用者丟到垃圾桶（30 天保留），而非直接清除
   * 回傳被丟入垃圾桶的快照，方便 UI 做 alert 提示
   */
  softDeleteUser: async (id) => {
    const target = get().users.find((u) => u.id === id);
    if (!target) return null;
    const updated = get().users.filter((user) => user.id !== id);
    set({ users: updated, syncError: null, isSyncing: hasSupabaseEnv });
    await persistUsers(updated);
    try {
      await pushUsers(updated);
    } catch (err) {
      set({ syncError: err instanceof Error ? err.message : 'User sync failed' });
      throw err;
    } finally {
      set({ isSyncing: false });
    }
    // 動態載入垃圾桶 store 避免循環依賴
    const { useTrashStore } = await import('@/store/trashStore');
    const snapshot: Record<string, unknown> = { ...target };
    const trashItem = await useTrashStore.getState().addToTrash('user', snapshot);
    return trashItem;
  },

  /** 保留舊名稱以維持向後相容；新行為走 softDeleteUser 流程丟到垃圾桶 */
  deleteUser: async (id) => {
    const { useTrashStore } = await import('@/store/trashStore');
    const target = get().users.find((u) => u.id === id);
    if (!target) return;
    const updated = get().users.filter((user) => user.id !== id);
    set({ users: updated, syncError: null, isSyncing: hasSupabaseEnv });
    await persistUsers(updated);
    try {
      await pushUsers(updated);
    } catch (err) {
      set({ syncError: err instanceof Error ? err.message : 'User sync failed' });
      throw err;
    } finally {
      set({ isSyncing: false });
    }
    await useTrashStore.getState().addToTrash('user', { ...target });
  },

  getUserByEmail: (email) => {
    return get().users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  },
}));
