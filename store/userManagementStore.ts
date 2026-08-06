import { create } from 'zustand';
import { User, UserRole } from '@/types';
import { storage } from '@/utils/storage';
import {
  fetchUserProfiles,
  syncUserProfiles,
  addUserProfile as addUserProfileToDb,
  updateUserProfile as updateUserProfileInDb,
  softDeleteUserProfile,
  hardDeleteUserProfile,
  hasSupabaseEnv,
} from '@/utils/fleetSync';
import type { TrashItem } from './trashStore';

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
  addUser: (name: string, email: string, password: string, role: 'driver' | 'company', phone?: string, avatar?: string, nameZh?: string, nameEn?: string, address?: string, companyId?: string) => Promise<{ success: boolean; error?: string }>;
  updateUser: (id: string, updates: Partial<Pick<ManagedUser, 'name' | 'email' | 'phone' | 'role' | 'avatar' | 'nameZh' | 'nameEn' | 'address' | 'companyId'>>) => Promise<void>;
  updateUserPassword: (id: string, password: string) => Promise<void>;
  /** 軟刪除並丟入垃圾桶；回傳垃圾桶項目快照(若該 id 不存在則回傳 null) */
  softDeleteUser: (id: string) => Promise<TrashItem | null>;
  /** 別名,委派給 softDeleteUser;UI 中既有 deleteUser() 呼叫端不必改動 */
  deleteUser: (id: string) => Promise<TrashItem | null>;
  getUserByEmail: (email: string) => ManagedUser | undefined;
  getCompanies: () => ManagedUser[];
  getCompanyById: (id: string) => ManagedUser | undefined;
  getUsersByCompanyId: (companyId: string) => ManagedUser[];
}

const generateId = (role: UserRole) => {
  if (role === 'driver') return `d${String(Date.now()).slice(-6)}`;
  return `u${String(Date.now()).slice(-6)}`;
};

async function persistUsers(users: ManagedUser[]) {
  await storage.setItem(STORAGE_KEY, JSON.stringify(users));
}

/**
 * 清掉結構不完整的 user 物件：必須具備非空字串的 id 與 email。
 * 用於 loadUsers/syncUsers/addUser/updateUser 等所有寫入路徑，
 * 避免從本地 storage 讀出的舊資料、或從 Supabase 同步下來的髒資料，
 * 污染記憶體內的 users 陣列，導致後續 .email.toLowerCase() 等操作崩潰。
 */
function sanitizeUsers(users: ManagedUser[]): ManagedUser[] {
  return users.filter(
    (u) => u && typeof u.id === 'string' && u.id.length > 0 && typeof u.email === 'string' && u.email.length > 0
  );
}

async function pushUsers(users: ManagedUser[]) {
  if (!hasSupabaseEnv) {
    return;
  }
  // 同步到 user_profile 表（含 password 欄位）
  // 注意：ManagedUser 的 password 仍是明碼(本地也是明碼儲存);
  // 未來應改為只上傳雜湊後的密碼,但目前 Auth 流程仍是明碼比對。
  await syncUserProfiles(users);
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

      // 再消毒一次：把缺 id / email 的結構不完整資料清掉，避免後續登入比對崩潰
      const sanitized = sanitizeUsers(migrated);

      if (sanitized.length < users.length) {
        users = sanitized;
        await persistUsers(users);
      } else if (migrated.length < users.length) {
        users = sanitized;
        await persistUsers(users);
      }

      set({ users: sanitized });
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
      // 從 user_profile 表取得遠端使用者
      const remoteUsers = await fetchUserProfiles();
      const localUsers = sanitizeUsers(get().users);

      if (remoteUsers.length > 0) {
        // 先把遠端資料也消毒，避免漏欄位的髒資料混入合併結果
        const sanitizedRemoteUsers = sanitizeUsers(remoteUsers as ManagedUser[]);

        // 合併策略：以 id 為主鍵（同一個 Clerk id / App 內部 id 對應同一筆）
        // 遠端優先（雲端是真相），但
        //   1. 同 id 合併時，若本地有 password 但遠端沒有 → 用本地 password
        //      （避免 sync 把本地密碼「清空」,造成另一台裝置登入失敗）
        //   2. 本地有而遠端沒有的 id 仍保留（包含剛被刪的本地副本、剛新增但尚未同步的）
        const mergedById = new Map<string, ManagedUser>();
        const remoteByEmail = new Map<string, ManagedUser>();

        for (const user of sanitizedRemoteUsers) {
          mergedById.set(user.id, user);
          remoteByEmail.set(user.email.toLowerCase(), user);
        }

        for (const local of localUsers) {
          const remoteById = mergedById.get(local.id);
          if (remoteById) {
            // 同一 id：遠端優先,但若本地有 password 而遠端沒有則補回去
            if ((!remoteById.password || remoteById.password.length === 0) && local.password) {
              mergedById.set(local.id, { ...remoteById, password: local.password });
            }
            continue;
          }
          const remoteByEmailMatch = remoteByEmail.get(local.email.toLowerCase());
          if (remoteByEmailMatch) {
            // 同 email 但不同 id：以遠端 id 為準（雲端已用新 id 重建）。
            // 若本地有 password,補到遠端 row。
            if (local.password && (!remoteByEmailMatch.password || remoteByEmailMatch.password.length === 0)) {
              mergedById.set(remoteByEmailMatch.id, { ...remoteByEmailMatch, password: local.password });
            }
            continue;
          }
          // 本地有、雲端沒有 → 保留（剛新增但尚未同步、或剛被刪除的本地副本）
          mergedById.set(local.id, local);
        }

        const merged = Array.from(mergedById.values());

        // 若本地比遠端多（剛新增但同步失敗），回寫雲端
        const remoteIds = new Set(sanitizedRemoteUsers.map((u) => u.id));
        const hasNewLocal = merged.some((u) => !remoteIds.has(u.id));

        set({ users: merged });
        await persistUsers(merged);
        if (hasNewLocal) {
          // 推回雲端時包含 password 欄位（雲端 auth 需要）
          await syncUserProfiles(merged);
        }
      } else if (localUsers.length > 0) {
        // 遠端沒有資料，把本地推上去（含 password）
        await persistUsers(localUsers);
        await syncUserProfiles(localUsers);
      }
    } catch (err) {
      set({ syncError: err instanceof Error ? err.message : 'User sync failed' });
    } finally {
      set({ isSyncing: false });
    }
  },

  addUser: async (name, email, password, role, phone, avatar, nameZh, nameEn, address, companyId) => {
    const existing = get().users.find((user) => user.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return { success: false, error: 'Email already registered' };
    }

    const newUser: ManagedUser = {
      id: generateId(role),
      name: nameZh || name || email.split('@')[0],
      nameZh,
      nameEn,
      email,
      password,
      role,
      phone,
      avatar,
      address,
      companyId,
    };

    const updated = sanitizeUsers([...get().users, newUser]);
    set({ users: updated });
    await persistUsers(updated);
    pushUsersInBackground(updated, (message) => set({ syncError: message }));
    return { success: true };
  },

  updateUser: async (id, updates) => {
    const updated = sanitizeUsers(
      get().users.map((user) => (user.id === id ? { ...user, ...updates } : user))
    );
    set({ users: updated });
    await persistUsers(updated);
    pushUsersInBackground(updated, (message) => set({ syncError: message }));
  },

  updateUserPassword: async (id, password) => {
    const updated = sanitizeUsers(
      get().users.map((user) => (user.id === id ? { ...user, password } : user))
    );
    set({ users: updated });
    await persistUsers(updated);
    pushUsersInBackground(updated, (message) => set({ syncError: message }));
  },

  /**
   * 軟刪除：把使用者丟到垃圾桶（30 天保留），同時也從 Supabase user_profile 表
   * 硬刪除以避免 syncUsers() 後又被拉回來。
   *
   * 行為：
   * 1. 從本地 `managed_users` 移除該 user 並 persist。
   * 2. 嘗試從 Supabase `user_profile` 表硬刪除該 row（DELETE, 不是 is_deleted=true）。
   * 3. 若 Supabase 沒設環境變數 → 直接結束（只在本地運作）。
   * 4. 若 Supabase 刪除失敗 → 退而求其次用 `pushUsers()` 把目前「剩餘 users」上傳，
   *    但因為已經從本地移除該 user,理論上不會再復活。
   * 5. 加進垃圾桶，仍然保留 30 天可從垃圾桶還原。
   * 回傳垃圾桶快照，UI 可用於 alert 提示。
   */
  softDeleteUser: async (id) => {
    const target = get().users.find((u) => u.id === id);
    if (!target) return null;
    const updated = sanitizeUsers(get().users.filter((user) => user.id !== id));
    set({ users: updated, syncError: null, isSyncing: hasSupabaseEnv });
    await persistUsers(updated);

    if (hasSupabaseEnv) {
      try {
        // 軟刪除（只把 is_deleted 設為 true），讓資料仍留在 user_profile 表內。
        // 若 30 天後垃圾桶過期且使用者未還原，再由 cleanupExpired() 排程 hardDelete。
        await softDeleteUserProfile(id);
        console.log(`[userManagement] soft-deleted user ${id} in user_profile`);
      } catch (err) {
        console.warn('[userManagement] softDelete failed, will fallback to push remaining:', err);
        try {
          // 退而求其次:用本地剩餘 users 推一次上去（不會包含被刪的）
          await pushUsers(updated);
        } catch (pushErr) {
          set({ syncError: pushErr instanceof Error ? pushErr.message : 'User sync failed' });
          throw pushErr;
        }
      } finally {
        set({ isSyncing: false });
      }
    }

    // 動態載入垃圾桶 store 避免循環依賴
    const { useTrashStore } = await import('@/store/trashStore');
    const snapshot: Record<string, unknown> = { ...target };
    const trashItem = await useTrashStore.getState().addToTrash('user', snapshot);
    return trashItem;
  },

  /** 保留舊名稱以維持向後相容；新行為走 softDeleteUser 流程丟到垃圾桶 */
  deleteUser: async (id) => {
    return await get().softDeleteUser(id);
  },

  getUserByEmail: (email) => {
    return get().users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  },

  getCompanies: () => {
    return get().users.filter((user) => user.role === 'company');
  },

  getCompanyById: (id) => {
    return get().users.find((user) => user.id === id && user.role === 'company');
  },

  getUsersByCompanyId: (companyId) => {
    return get().users.filter((user) => user.companyId === companyId);
  },
}));
