import { create } from 'zustand';
import { Customer, DeliveryAddress } from '@/types';
import { storage } from '@/utils/storage';
import { hasSupabaseEnv } from '@/utils/supabase';
import { useAuthStore } from './authStore';

function getStorageKey(): string {
  const userId = useAuthStore.getState().user?.id ?? 'guest';
  return `customers_${userId}`;
}

interface CustomerState {
  customers: Customer[];
  isLoading: boolean;
  isSyncing: boolean;
  syncError: string | null;
  loadCustomers: () => Promise<void>;
  syncCustomers: () => Promise<void>;
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Customer>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  getCustomerById: (id: string) => Customer | undefined;
  searchCustomers: (query: string) => Customer[];
  incrementOrderCount: (customerId: string) => Promise<void>;
}

async function persistCustomers(customers: Customer[]) {
  await storage.setItem(getStorageKey(), JSON.stringify(customers));
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  isLoading: true,
  isSyncing: false,
  syncError: null,

  loadCustomers: async () => {
    try {
      const stored = await storage.getItem(getStorageKey());
      if (stored) {
        set({ customers: JSON.parse(stored), isLoading: false });
      } else {
        set({ customers: [], isLoading: false });
      }
    } catch {
      set({ customers: [], isLoading: false });
    }
  },

  syncCustomers: async () => {
    console.log('[customerStore] syncCustomers called');
    console.log('[customerStore] hasSupabaseEnv:', hasSupabaseEnv);

    if (!hasSupabaseEnv) {
      console.log('[customerStore] NO SUPABASE ENV, skipping');
      return;
    }

    set({ isSyncing: true, syncError: null });
    try {
      const currentUser = useAuthStore.getState().user;
      const userRole = currentUser?.role ?? 'user';
      const userId = currentUser?.id ?? '';
      const companyId = currentUser?.companyId;

      console.log('[customerStore] role:', userRole, 'userId:', userId, 'companyId:', companyId);

      const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      let queryUrl = `${url}/rest/v1/customers?is_deleted=eq.false`;

      if (userRole === 'company' && companyId) {
        queryUrl += `&company_id=eq.${encodeURIComponent(companyId)}`;
      }
      queryUrl += '&order=created_at.desc';

      console.log('[customerStore] Fetching from:', queryUrl);

      const response = await fetch(queryUrl, {
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey!,
          'Content-Type': 'application/json',
        },
      });

      console.log('[customerStore] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[customerStore] API error:', errorText);
        throw new Error(`API error: ${response.status}`);
      }

      const remoteData = await response.json();
      console.log('[customerStore] Got', remoteData.length, 'customers from API');

      const remoteCustomers: Customer[] = remoteData.map((db: Record<string, unknown>) => ({
        id: db.id as string,
        userId: db.user_id as string | undefined,
        companyId: db.company_id as string | undefined,
        name: db.name as string,
        phone: db.phone as string | undefined,
        email: db.email as string | undefined,
        address: db.address as string | undefined,
        deliveryAddresses: (db.delivery_addresses as DeliveryAddress[] | undefined) ?? [],
        notes: db.notes as string | undefined,
        totalOrders: db.total_orders as number | undefined,
        lastOrderAt: db.last_order_at as string | undefined,
        createdAt: db.created_at as string,
        updatedAt: db.updated_at as string,
        isDeleted: db.is_deleted as boolean | undefined,
      }));

      console.log('[customerStore] Converted', remoteCustomers.length, 'customers');

      set({ customers: remoteCustomers, isLoading: false, isSyncing: false });
      await persistCustomers(remoteCustomers);

      console.log('[customerStore] Synced', remoteCustomers.length, 'customers to store');
    } catch (err) {
      console.error('[customerStore] syncCustomers error:', err);
      set({ syncError: err instanceof Error ? err.message : 'Customer sync failed' });
    } finally {
      set({ isSyncing: false });
    }
  },

  addCustomer: async (customerData) => {
    const now = new Date();
    const id = `cust${Date.now()}`;
    const currentUser = useAuthStore.getState().user;

    const newCustomer: Customer = {
      ...customerData,
      id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      userId: currentUser?.id,
      companyId: currentUser?.companyId,
      totalOrders: 0,
    };

    const updated = [newCustomer, ...get().customers];
    set({ customers: updated });
    await persistCustomers(updated);

    // 同步到 Supabase（失敗不阻止流程）
    if (hasSupabaseEnv) {
      try {
        const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

        const dbRecord = {
          id: newCustomer.id,
          user_id: newCustomer.userId,
          company_id: newCustomer.companyId,
          name: newCustomer.name,
          phone: newCustomer.phone ?? null,
          email: newCustomer.email ?? null,
          address: newCustomer.address ?? null,
          delivery_addresses: newCustomer.deliveryAddresses ?? [],
          notes: newCustomer.notes ?? null,
          total_orders: 0,
        };

        const response = await fetch(`${url}/rest/v1/customers`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey!,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(dbRecord),
        });

        if (!response.ok) {
          throw new Error(`Failed to sync customer: ${response.status}`);
        }

        console.log('[customerStore] Synced new customer to Supabase');
      } catch (err) {
        console.error('[customerStore] Failed to sync customer to Supabase:', err);
      }
    }

    return newCustomer;
  },

  updateCustomer: async (id, updates) => {
    const now = new Date().toISOString();
    const updatedCustomers = get().customers.map((c) =>
      c.id === id ? { ...c, ...updates, updatedAt: now } : c
    );
    set({ customers: updatedCustomers });
    await persistCustomers(updatedCustomers);

    // 同步到 Supabase
    if (hasSupabaseEnv) {
      try {
        const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

        const dbUpdates: Record<string, unknown> = {
          name: updates.name,
          phone: updates.phone ?? null,
          email: updates.email ?? null,
          address: updates.address ?? null,
          delivery_addresses: updates.deliveryAddresses ?? null,
          notes: updates.notes ?? null,
        };

        const response = await fetch(`${url}/rest/v1/customers?id=eq.${id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dbUpdates),
        });

        if (!response.ok) {
          throw new Error(`Failed to update customer: ${response.status}`);
        }

        console.log('[customerStore] Updated customer in Supabase');
      } catch (err) {
        console.error('[customerStore] Failed to update customer in Supabase:', err);
      }
    }
  },

  deleteCustomer: async (id) => {
    const updatedCustomers = get().customers.map((c) =>
      c.id === id ? { ...c, isDeleted: true } : c
    );
    set({ customers: updatedCustomers });
    await persistCustomers(updatedCustomers);

    // 同步刪除到 Supabase（軟刪除）
    if (hasSupabaseEnv) {
      try {
        const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

        const response = await fetch(`${url}/rest/v1/customers?id=eq.${id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_deleted: true }),
        });

        if (!response.ok) {
          throw new Error(`Failed to delete customer: ${response.status}`);
        }

        console.log('[customerStore] Soft-deleted customer in Supabase');
      } catch (err) {
        console.error('[customerStore] Failed to delete customer in Supabase:', err);
      }
    }
  },

  getCustomerById: (id) => {
    return get().customers.find((c) => c.id === id);
  },

  searchCustomers: (query) => {
    const lowerQuery = query.toLowerCase();
    return get().customers.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.phone?.toLowerCase().includes(lowerQuery) ||
        c.email?.toLowerCase().includes(lowerQuery) ||
        c.address?.toLowerCase().includes(lowerQuery)
    );
  },

  incrementOrderCount: async (customerId) => {
    const customer = get().getCustomerById(customerId);
    if (!customer) return;

    const now = new Date().toISOString();
    const newTotalOrders = (customer.totalOrders ?? 0) + 1;

    await get().updateCustomer(customerId, {
      totalOrders: newTotalOrders,
      lastOrderAt: now,
    });
  },
}));
