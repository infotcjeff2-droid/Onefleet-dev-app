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
  hardDeleteUserProfileByEmail,
  hasSupabaseEnv,
} from '@/utils/fleetSync';
import type { TrashItem } from './trashStore';

const STORAGE_KEY = 'managed_users';
const DRIVER_STORAGE_KEY = 'managed_drivers';

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
  /**
   * 軟刪除並丟入垃圾桶（30 天保留，期間無法登入）。
   * 雲端若可刪會嘗試 hardDeleteUserProfile；失敗則 fallback softDeleteUserProfile。
   * 回傳垃圾桶項目快照(若該 id 不存在則回傳 null)
   */
  softDeleteUser: (id: string) => Promise<TrashItem | null>;
  /** 別名,委派給 softDeleteUser;UI 中既有 deleteUser() 呼叫端不必改動 */
  deleteUser: (id: string) => Promise<TrashItem | null>;
  /**
   * 垃圾桶「永久刪除」：從 trash 移除，並依 payload.source 真實刪除雲端帳號
   * - source='clerk'   → 呼叫 Clerk Edge Function 刪除 Clerk user
   * - source='managed' → 從 Supabase user_profile 表刪除
   * - source='supabase'→ 從 Supabase user_profile 表刪除
   */
  permanentDeleteUser: (trashItem: TrashItem) => Promise<void>;
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
 *
 * 同時排除系統管理員 (id = 'u-admin')，因為 admin 由 authStore 內建負責、
 * 不應被列入「使用者管理」畫面的司機 / 公司清單。
 */
function sanitizeUsers(users: ManagedUser[]): ManagedUser[] {
  return users.filter(
    (u) =>
      u &&
      typeof u.id === 'string' &&
      u.id.length > 0 &&
      u.id !== 'u-admin' &&
      typeof u.email === 'string' &&
      u.email.length > 0
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
    // ★ 除錯日誌
    console.log('[userManagement] loadUsers() 開始');
    try {
      const stored = await storage.getItem(STORAGE_KEY);
      let users: ManagedUser[] = stored ? JSON.parse(stored) : [];
      console.log('[userManagement] loadUsers 從 storage 載入 users.length:', users.length);

      // Migration: 如果 storage 已污染（含有 defaultDrivers 的 ID 但未經正常創建流程），
      // 清理掉這些啞資料，讓 users 保持乾淨。
      const defaultDriverIds = ['d001', 'd002', 'd003', 'd004'];
      const migrated = users.filter((u) => !defaultDriverIds.includes(u.id));

      // 再消毒一次：把缺 id / email 的結構不完整資料清掉，避免後續登入比對崩潰
      const sanitized = sanitizeUsers(migrated);
      console.log('[userManagement] sanitizeUsers 後 users.length:', sanitized.length);

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
    console.log('[userManagement] syncUsers() 開始, hasSupabaseEnv:', hasSupabaseEnv);
    if (!hasSupabaseEnv) {
      return;
    }

    set({ isSyncing: true, syncError: null });
    try {
      // ★ 防衛：垃圾桶鎖定中的 email 不應被 syncUsers() 從雲端拉回來，
      //   即使雲端留有 is_deleted=false 的殭屍 row（過去 DELETE 失敗的遺留）也不行。
      //   注意：loadTrash() 必須在 fetchUserProfiles() 之前呼叫，
      //   否則時序問題會導致 trashedEmails 仍是空的，過濾失效。
      let trashedEmails: Set<string> = new Set();
      let trashLoadFailed = false;
      try {
        const { useTrashStore } = await import('./trashStore');
        await useTrashStore.getState().loadTrash();
        trashedEmails = new Set(useTrashStore.getState().getTrashedUserEmails());
      } catch (e) {
        console.warn('[userManagement] trash load for sync filter skipped:', e);
        trashLoadFailed = true;
      }

      // 從 user_profile 表取得遠端使用者（在垃圾桶載入完成後）
      const remoteUsers = await fetchUserProfiles();
      const localUsers = sanitizeUsers(get().users);

      // 若垃圾桶載入失敗，至少 log 警告，並繼續執行（避免整個同步失敗）
      if (trashLoadFailed && remoteUsers.length > 0) {
        console.warn(
          '[userManagement] trash load failed, proceeding with unfiltered sync. ' +
          'Deleted users may reappear if they exist in cloud with is_deleted=false.'
        );
      }

      // 過濾掉垃圾桶中的 email（不論是 remote 的復活或 local 的副本都不該出現）
      const filteredRemoteUsers = remoteUsers.filter(
        (u) => !trashedEmails.has((u.email ?? '').trim().toLowerCase())
      );
      const filteredLocalUsers = localUsers.filter(
        (u) => !trashedEmails.has((u.email ?? '').trim().toLowerCase())
      );

      if (trashedEmails.size > 0) {
        const filteredOut = remoteUsers.length - filteredRemoteUsers.length;
        if (filteredOut > 0) {
          console.log(
            `[userManagement] syncUsers 過濾掉 ${filteredOut} 個垃圾桶中的使用者（trashedEmails: ${trashedEmails.size} 個）`
          );
        }
      }

      if (filteredRemoteUsers.length > 0) {
        // 先把遠端資料也消毒，避免漏欄位的髒資料混入合併結果
        const sanitizedRemoteUsers = sanitizeUsers(filteredRemoteUsers as ManagedUser[]);

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

        for (const local of filteredLocalUsers) {
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
      } else if (filteredLocalUsers.length > 0) {
        // 遠端沒有資料，把本地推上去（含 password）
        await persistUsers(filteredLocalUsers);
        await syncUserProfiles(filteredLocalUsers);
      }

      if (trashedEmails.size > 0) {
        console.log(
          `[userManagement] syncUsers 過濾掉 ${trashedEmails.size} 個垃圾桶鎖定中的 email`
        );
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
   *    - 若失敗（例：RLS 拒絕 DELETE）→ 退而求其次 softDeleteUserProfile() 設 is_deleted=true。
   *    - 若兩者皆失敗 → 仍不影響本地（已先移除），只記錄錯誤。
   * 3. 加進垃圾桶，仍然保留 30 天可從垃圾桶還原。
   * 回傳垃圾桶快照，UI 可用於 alert 提示。
   */
  softDeleteUser: async (id) => {
    const target = get().users.find((u) => u.id === id);
    if (!target) return null;
    const updated = sanitizeUsers(get().users.filter((user) => user.id !== id));
    set({ users: updated, syncError: null, isSyncing: hasSupabaseEnv });
    await persistUsers(updated);

    // ★ 同步清理 managed_drivers，避免刪除的司機從 driverStore 復活
    if (target.role === 'driver') {
      try {
        const storedDrivers = await storage.getItem(DRIVER_STORAGE_KEY);
        if (storedDrivers) {
          const drivers = JSON.parse(storedDrivers);
          const filteredDrivers = drivers.filter((d: { id: string }) => d.id !== id);
          await storage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(filteredDrivers));
          console.log(`[userManagement] removed driver ${id} from managed_drivers`);
        }
      } catch (err) {
        console.warn('[userManagement] failed to clean managed_drivers:', err);
      }
    }

    // 雲端處理（不影響本地已刪的事實）
    if (hasSupabaseEnv) {
      try {
        // 真硬刪除（DELETE FROM）— 確保 syncUsers() 後不會再被拉回來
        await hardDeleteUserProfile(id);
        console.log(`[userManagement] hard-deleted user ${id} in user_profile`);
      } catch (hardErr) {
        console.warn('[userManagement] hardDelete failed, will fallback to softDelete:', hardErr);
        try {
          // 退而求其次：把 is_deleted 設為 true；fetchUserProfiles() 過濾 is_deleted=false
          await softDeleteUserProfile(id);
          console.log(`[userManagement] soft-deleted user ${id} in user_profile (fallback)`);
        } catch (softErr) {
          console.error(
            '[userManagement] both hardDelete and softDelete failed for user',
            id,
            hardErr,
            softErr
          );
          set({ syncError: '無法從雲端刪除使用者，請檢查 RLS 政策與連線狀態。' });
        }
      } finally {
        set({ isSyncing: false });
      }
    }

    // 動態載入垃圾桶 store 避免循環依賴
    const { useTrashStore } = await import('@/store/trashStore');
    const snapshot: Record<string, unknown> = {
      ...target,
      // 標記來源,垃圾桶「永久刪除」時決定要走 Clerk 還是 Supabase
      // - 'clerk'   : 此帳號已在 Clerk 建立(透過「同步至雲端」按鈕)
      // - 'managed' : 純 App 內建帳號,只在 Supabase user_profile 表
      // 預設 'managed'；如未來 addUser 流程有標記可覆寫
      source: (target as { source?: 'managed' | 'clerk' }).source ?? 'managed',
    };
    const trashItem = await useTrashStore.getState().addToTrash('user', snapshot);
    return trashItem;
  },

  /** 保留舊名稱以維持向後相容；新行為走 softDeleteUser 流程丟到垃圾桶 */
  deleteUser: async (id) => {
    return await get().softDeleteUser(id);
  },

  /**
   * 垃圾桶「永久刪除」：從 trash 移除,並依 payload.source 真實刪除雲端帳號
   */
  permanentDeleteUser: async (trashItem) => {
    const payload = trashItem.payload as Record<string, unknown>;
    const source = (payload.source as 'managed' | 'clerk' | 'supabase' | undefined) ?? 'managed';
    const userId = String(payload.id ?? trashItem.originalId);
    const email = typeof payload.email === 'string' ? payload.email : undefined;

    // 1) 從垃圾桶移除（先做,即使後面雲端刪除失敗,使用者也不會再從還原路徑回來）
    const { useTrashStore } = await import('@/store/trashStore');
    await useTrashStore.getState().removeFromTrash(trashItem.trashId);

    // 2) 依來源刪除雲端帳號
    if (source === 'clerk') {
      // Clerk 帳號：用 Edge Function 刪除（CLERK_SECRET_KEY 只在 Supabase 端）
      try {
        if (!email) throw new Error('Clerk 帳號缺少 email,無法刪除');
        const { deleteClerkUserByEmail } = await import('@/utils/clerkSync');
        const result = await deleteClerkUserByEmail(email);
        console.log(`[userManagement] permanent delete from Clerk:`, email, result);
      } catch (err) {
        console.error('[userManagement] Clerk permanent delete failed:', err);
        // 不阻擋流程 — Supabase 部分照樣處理
      }
    }

    // 3) Supabase user_profile 表刪除（無論 source 為何都做,確保雲端 row 移除）
    //    ★ 雙重保護：用 email 強制清掉所有可能殭屍 row（包括 is_deleted=false 的），
    //      再用 id 保險清一次，避免下次 syncUsers() 又從 cloud 復活這筆。
    if (hasSupabaseEnv && email) {
      try {
        const result = await hardDeleteUserProfileByEmail(email);
        console.log(
          `[userManagement] permanent hard-deleted by email ${email}:`,
          result
        );
      } catch (err) {
        console.error('[userManagement] permanent hardDelete by email failed:', err);
        // fallback: 用 userId 再試一次
        try {
          await hardDeleteUserProfile(userId);
        } catch {
          /* ignore */
        }
      }
    }
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
