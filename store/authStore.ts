import { create } from 'zustand';
import { User, UserRole } from '@/types';
import { storage } from '@/utils/storage';

const ADMIN_EMAIL = 'admin@fleetpro.com';
const ADMIN_PASSWORD = 'admin123';
const DEMO_EMAIL = 'demo@fleetpro.com';
const DEMO_PASSWORD = 'demo123';
const DRIVER_EMAIL = 'driver';
const DRIVER_PASSWORD = 'driver';
const COMPANY_EMAIL = 'company';
const COMPANY_PASSWORD = 'company';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  role: UserRole | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateCurrentUser: (updates: Partial<Pick<User, 'name' | 'email' | 'phone' | 'avatar'>>) => Promise<void>;
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

  login: async (email: string, password: string) => {
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      const user: User = { id: 'u-admin', email, name: '系統管理員', role: 'admin' };
      set({ user, isAuthenticated: true, role: 'admin' });
      await persistUser(user);
      return { success: true };
    }

    if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
      const user: User = { id: 'u-demo', email, name: '示範用戶', role: 'user' };
      set({ user, isAuthenticated: true, role: 'user' });
      await persistUser(user);
      return { success: true };
    }

    if (email === DRIVER_EMAIL && password === DRIVER_PASSWORD) {
      const user: User = { id: 'd001', email, name: '陳大文', role: 'driver' };
      set({ user, isAuthenticated: true, role: 'driver' });
      await persistUser(user);
      return { success: true };
    }

    if (email === COMPANY_EMAIL && password === COMPANY_PASSWORD) {
      const user: User = { id: 'u-company', email, name: '物流公司', role: 'company' };
      set({ user, isAuthenticated: true, role: 'company' });
      await persistUser(user);
      return { success: true };
    }

    const { users } = await import('./userManagementStore').then((module) => module.useUserManagementStore.getState());
    const managedUser = users.find((item) => item.email.toLowerCase() === email.toLowerCase() && item.password === password);
    if (managedUser) {
      const { password: _password, ...userWithoutPassword } = managedUser;
      set({ user: userWithoutPassword, isAuthenticated: true, role: userWithoutPassword.role });
      await persistUser(userWithoutPassword);
      return { success: true };
    }

    return { success: false, error: 'Invalid email or password' };
  },

  logout: async () => {
    set({ user: null, isAuthenticated: false, role: null });
    await persistUser(null);
  },

  checkAuth: async () => {
    try {
      const stored = await storage.getItem('user');
      if (stored) {
        const user: User = JSON.parse(stored);
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
}));
