import { create } from 'zustand';
import { User, UserRole } from '@/types';
import { adminCredentials, demoCredentials, driverCredentials, companyCredentials } from '@/constants/mockData';
import { storage } from '@/utils/storage';
import { getClerkInstance } from '@clerk/expo';
import { hasSupabaseEnv, syncUserProfiles } from '@/utils/fleetSync';

/**
 * 確保 admin 帳號已同步到 Supabase `user_profile` 表(含 password 欄位)。
 * 這樣多裝置登入時,若 managed_users 為空(例如全新安裝),可以透過 Supabase 驗證。
 */
async function ensureAdminSyncedToSupabase(email: string, password: string): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    await syncUserProfiles([
      {
        id: 'u-admin',
        email,
        name: 'Administrator',
        role: 'admin',
        password,
      },
    ]);
    console.log('[authStore] admin user synced to Supabase');
  } catch (err) {
    console.warn('[authStore] admin sync to Supabase failed:', err);
  }
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  role: UserRole | null;
  isLoading: boolean;
  isLoggingOut: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateCurrentUser: (updates: Partial<Pick<User, 'name' | 'email' | 'phone' | 'avatar'>>) => Promise<void>;
  setUser: (user: User | null) => void;
  setIsAuthenticated: (isAuth: boolean) => void;
  setRole: (role: UserRole | null) => void;
  setLoggingOut: (val: boolean) => void;
}

async function persistUser(user: User | null) {
  if (user) {
    await storage.setItem('user', JSON.stringify(user));
  } else {
    await storage.removeItem('user');
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  role: null,
  isLoading: true,
  isLoggingOut: false,

  login: async (email: string, password: string) => {
    await new Promise((resolve) => setTimeout(resolve, 800));

    // ── 1. 內建示範帳號(優先) ───────────────────────────────────────────────
    // 這些是 hardcoded 的示範帳號,優先比對,讓 fresh install 也能登入。
    if (email === adminCredentials.email && password === adminCredentials.password) {
      const user: User = { id: 'u-admin', email, name: 'Administrator', role: 'admin' };
      set({ user, isAuthenticated: true, role: 'admin' });
      await persistUser(user);
      // 確保 admin 帳號也同步到 Supabase,讓多裝置能驗證
      await ensureAdminSyncedToSupabase(email, password);
      return { success: true };
    }

    if (email === demoCredentials.email && password === demoCredentials.password) {
      const user: User = { id: 'u-demo', email, name: 'Demo User', role: 'user' };
      set({ user, isAuthenticated: true, role: 'user' });
      await persistUser(user);
      return { success: true };
    }

    if (email === driverCredentials.email && password === driverCredentials.password) {
      // 確保 userManagementStore 已載入
      const { users, loadUsers } = await import('./userManagementStore').then((m) => m.useUserManagementStore.getState());
      if (users.length === 0) {
        await loadUsers();
      }
      const currentUsers = (await import('./userManagementStore').then((m) => m.useUserManagementStore.getState())).users;
      // 根據配送單的 assignedDriverId 找到實際的司機
      // 如果有多個司機，使用第一個（Jeff3 是第一個被新增的）
      const managedDriver = currentUsers.find((u) => u.role === 'driver');
      if (managedDriver) {
        const { password: _pwd, ...userWithoutPassword } = managedDriver;
        // 司機的 companyId 應該來自公司（如果有公司管理的話）
        // 如果沒有 companyId，司機仍然可以通過 assigned_driver_id 查詢
        console.log('[authStore] Driver login, using managed driver:', managedDriver.id, managedDriver.name, 'companyId:', managedDriver.companyId);
        set({ user: userWithoutPassword, isAuthenticated: true, role: 'driver' });
        await persistUser(userWithoutPassword);
        return { success: true };
      }
      // Fallback：使用預設 ID（僅當沒有管理過的司機時）
      console.log('[authStore] Driver login, using fallback ID: d001');
      const user: User = { id: 'd001', email, name: 'Driver', role: 'driver' };
      set({ user, isAuthenticated: true, role: 'driver' });
      await persistUser(user);
      return { success: true };
    }

    if (email === companyCredentials.email && password === companyCredentials.password) {
      // 確保 userManagementStore 已載入
      const { users, loadUsers } = await import('./userManagementStore').then((m) => m.useUserManagementStore.getState());
      if (users.length === 0) {
        await loadUsers();
      }
      const currentUsers = (await import('./userManagementStore').then((m) => m.useUserManagementStore.getState())).users;
      // 找到第一個公司用戶
      const managedCompany = currentUsers.find((u) => u.role === 'company');
      if (managedCompany) {
        const { password: _pwd, ...userWithoutPassword } = managedCompany;
        // 公司用戶的 companyId 應該是自己的 id（用於派單的 company_id 欄位）
        const userForCompany: User = {
          ...userWithoutPassword,
          companyId: managedCompany.id, // 公司屬於自己
        };
        console.log('[authStore] Company login, using managed company:', managedCompany.id, managedCompany.name);
        set({ user: userForCompany, isAuthenticated: true, role: 'company' });
        await persistUser(userForCompany);
        return { success: true };
      }
      // Fallback：使用預設 ID
      console.log('[authStore] Company login, using fallback ID: u-company');
      const user: User = { id: 'u-company', email, name: 'Company', role: 'company' };
      set({ user, isAuthenticated: true, role: 'company' });
      await persistUser(user);
      return { success: true };
    }

    // ── 2. Managed users(從本地 / Supabase 同步) ─────────────────────────────
    // 確保 users 已載入(否則直接從 storage 讀取)
    let managedUserList: { email: string; password?: string; companyId?: string; role: UserRole; id: string; name: string; phone?: string; avatar?: string; nameZh?: string; nameEn?: string; address?: string }[] = [];
    const { users, loadUsers, syncUsers } = await import('./userManagementStore').then((module) => module.useUserManagementStore.getState());
    if (users.length === 0) {
      // users 未載入,先載入本地;若本地為空,嘗試從 Supabase 拉取
      await loadUsers();
      let currentUsers = (await import('./userManagementStore').then((m) => m.useUserManagementStore.getState())).users;
      if (currentUsers.length === 0 && hasSupabaseEnv) {
        // 從 Supabase 拉取並加入本地
        await syncUsers();
        currentUsers = (await import('./userManagementStore').then((m) => m.useUserManagementStore.getState())).users;
      }
      managedUserList = currentUsers;
    } else {
      managedUserList = users;
    }

    // Fallback: 如果 store 還是空的,直接從 storage 讀取 users
    if (managedUserList.length === 0) {
      try {
        const storedUsers = await storage.getItem('managed_users');
        if (storedUsers) {
          managedUserList = JSON.parse(storedUsers);
        }
      } catch {
        // ignore
      }
    }

    const normalizedEmail = email.toLowerCase();
    const managedUser = managedUserList.find(
      (item) => typeof item?.email === 'string' && item.email.toLowerCase() === normalizedEmail && item.password === password
    );
    if (managedUser) {
      const { password: _password, ...userWithoutPassword } = managedUser;
      // 確保使用最新的 companyId(從 userManagementStore 取得)
      const userWithLatestData: User = {
        ...userWithoutPassword,
        companyId: managedUser.companyId,
      };
      set({ user: userWithLatestData, isAuthenticated: true, role: userWithLatestData.role });
      await persistUser(userWithLatestData);
      return { success: true };
    }

    return { success: false, error: 'Invalid email or password' };
  },

  logout: async () => {
    set({ isLoggingOut: true });
    try {
      const clerk = getClerkInstance();
      await clerk.signOut();
    } catch {
      // Ignore Clerk sign-out errors (e.g. no active session)
    }
    set({ user: null, isAuthenticated: false, role: null, isLoading: false });
    await persistUser(null);
    set({ isLoggingOut: false });
  },

  checkAuth: async () => {
    try {
      // 先確保 users 已載入（包含最新的 companyId）
      const userStoreModule = await import('./userManagementStore');
      const { loadUsers, syncUsers, users } = userStoreModule.useUserManagementStore.getState();
      await loadUsers();
      await syncUsers();

      const stored = await storage.getItem('user');
      if (stored) {
        const user: User = JSON.parse(stored);
        // 確保 authStore 的 user 有最新的 companyId
        if (user && user.email) {
          const updatedUsers = userStoreModule.useUserManagementStore.getState().users;
          const managedUser = updatedUsers.find(
            (u: { email?: string }) => u.email?.toLowerCase() === user.email?.toLowerCase()
          );
          if (managedUser) {
            user.companyId = managedUser.companyId;
            user.role = managedUser.role;
            await persistUser(user);
          }
        }
        set({ user, isAuthenticated: true, role: user.role, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  updateCurrentUser: async (updates) => {
    const currentUser = get().user;
    if (!currentUser) {
      return;
    }

    const user = { ...currentUser, ...updates };
    set({ user, role: user.role });
    await persistUser(user);
  },

  setUser: (user) => {
    set({ user });
    persistUser(user);
  },

  setIsAuthenticated: (isAuth) => {
    set({ isAuthenticated: isAuth });
  },

  setRole: (role) => {
    set({ role });
  },

  setLoggingOut: (val: boolean) => {
    set({ isLoggingOut: val });
  },
}));
