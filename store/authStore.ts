import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, UserRole } from '@/types';
import { adminCredentials, demoCredentials, driverCredentials, companyCredentials } from '@/constants/mockData';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  role: UserRole | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  role: null,
  isLoading: true,

  login: async (email: string, password: string) => {
    await new Promise((r) => setTimeout(r, 800));

    if (email === adminCredentials.email && password === adminCredentials.password) {
      const user: User = { id: 'u-admin', email, name: 'Administrator', role: 'admin' };
      set({ user, isAuthenticated: true, role: 'admin' });
      await AsyncStorage.setItem('user', JSON.stringify(user));
      return { success: true };
    }

    if (email === demoCredentials.email && password === demoCredentials.password) {
      const user: User = { id: 'u-demo', email, name: 'Demo User', role: 'user' };
      set({ user, isAuthenticated: true, role: 'user' });
      await AsyncStorage.setItem('user', JSON.stringify(user));
      return { success: true };
    }

    if (email === driverCredentials.email && password === driverCredentials.password) {
      const user: User = { id: 'u-driver', email, name: 'Driver', role: 'driver' };
      set({ user, isAuthenticated: true, role: 'driver' });
      await AsyncStorage.setItem('user', JSON.stringify(user));
      return { success: true };
    }

    if (email === companyCredentials.email && password === companyCredentials.password) {
      const user: User = { id: 'u-company', email, name: 'Company', role: 'company' };
      set({ user, isAuthenticated: true, role: 'company' });
      await AsyncStorage.setItem('user', JSON.stringify(user));
      return { success: true };
    }

    return { success: false, error: 'Invalid email or password' };
  },

  logout: async () => {
    set({ user: null, isAuthenticated: false, role: null });
    await AsyncStorage.removeItem('user');
  },

  checkAuth: async () => {
    try {
      const stored = await AsyncStorage.getItem('user');
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
}));
