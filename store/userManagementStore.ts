import { create } from 'zustand';
import { User, UserRole } from '@/types';
import { storage } from '@/utils/storage';

const STORAGE_KEY = 'managed_users';

interface ManagedUser extends User {
  password?: string;
}

interface UserManagementState {
  users: ManagedUser[];
  loadUsers: () => Promise<void>;
  addUser: (name: string, email: string, password: string, role: 'driver' | 'company', phone?: string, avatar?: string) => Promise<{ success: boolean; error?: string }>;
  updateUser: (id: string, updates: Partial<Pick<ManagedUser, 'name' | 'email' | 'phone' | 'role' | 'avatar'>>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  getUserByEmail: (email: string) => ManagedUser | undefined;
}

const generateId = (role: UserRole) => {
  if (role === 'driver') return `d${String(Date.now()).slice(-6)}`;
  return `u${String(Date.now()).slice(-6)}`;
};

export const useUserManagementStore = create<UserManagementState>((set, get) => ({
  users: [],

  loadUsers: async () => {
    try {
      const stored = await storage.getItem(STORAGE_KEY);
      if (stored) {
        set({ users: JSON.parse(stored) });
      }
    } catch {
      set({ users: [] });
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
    await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return { success: true };
  },

  updateUser: async (id, updates) => {
    const updated = get().users.map((user) => (user.id === id ? { ...user, ...updates } : user));
    set({ users: updated });
    await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  deleteUser: async (id) => {
    const updated = get().users.filter((user) => user.id !== id);
    set({ users: updated });
    await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  getUserByEmail: (email) => {
    return get().users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  },
}));
