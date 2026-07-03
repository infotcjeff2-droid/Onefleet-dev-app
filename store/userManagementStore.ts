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
      if (stored) {
        set({ users: JSON.parse(stored) });
      }
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
      if (remote) {
        const remoteUsers = remote.users as ManagedUser[];
        set({ users: remoteUsers });
        await persistUsers(remoteUsers);
      } else {
        const localUsers = get().users;
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

  deleteUser: async (id) => {
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
  },

  getUserByEmail: (email) => {
    return get().users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  },
}));
