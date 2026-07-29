import { Vehicle, User, DeliveryOrder } from '@/types';
import { supabase } from './supabase';
import { useAuthStore } from '@/store/authStore';

const TABLE_NAME = 'fleet_sync';

export const hasSupabaseEnv = Boolean(supabase);

export interface FleetSyncSnapshot {
  vehicles: Vehicle[];
  deliveries: DeliveryOrder[];
  users: User[];
}

interface SyncEnvelope {
  user_id: string;
  fleet_id?: string;
  vehicles: Vehicle[];
  deliveries: DeliveryOrder[];
  users: User[];
  updated_at?: string;
}

function ensureClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}

/** 取得目前登入使用者的 Clerk userId（對應 Supabase auth.uid()） */
function getCurrentUserId(): string {
  return useAuthStore.getState().user?.id ?? '';
}

function normalizeSnapshot(snapshot?: Partial<FleetSyncSnapshot> | null): FleetSyncSnapshot {
  return {
    vehicles: Array.isArray(snapshot?.vehicles) ? snapshot.vehicles : [],
    deliveries: Array.isArray(snapshot?.deliveries) ? snapshot.deliveries : [],
    users: Array.isArray(snapshot?.users) ? snapshot.users : [],
  };
}

/**
 * 從 Supabase 擷取目前使用者的資料快照。
 * RLS 政策由 user_id = auth.uid() 自動過濾，確保每位用戶只能讀取自己的資料。
 */
export async function fetchFleetSnapshot(): Promise<FleetSyncSnapshot | null> {
  const client = ensureClient();
  const userId = getCurrentUserId();

  if (!userId) {
    return null;
  }

  const { data, error } = await client
    .from(TABLE_NAME)
    .select('user_id, vehicles, deliveries, users, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return normalizeSnapshot({
    vehicles: data.vehicles as Vehicle[],
    deliveries: data.deliveries as DeliveryOrder[],
    users: data.users as User[],
  });
}

/**
 * 將目前使用者的資料快照寫入 Supabase（upsert by user_id）。
 * 所有資料以 userId 為 key 隔離，不會覆寫其他使用者的資料。
 */
export async function pushFleetSnapshot(snapshot: Partial<FleetSyncSnapshot>) {
  const client = ensureClient();
  const userId = getCurrentUserId();

  if (!userId) {
    throw new Error('User not authenticated, cannot sync fleet data.');
  }

  const currentRemote = await fetchFleetSnapshot().catch(() => null);
  const merged = normalizeSnapshot({
    vehicles: snapshot.vehicles ?? currentRemote?.vehicles,
    deliveries: snapshot.deliveries ?? currentRemote?.deliveries,
    users: snapshot.users ?? currentRemote?.users,
  });

  const payload: SyncEnvelope = {
    user_id: userId,
    vehicles: merged.vehicles,
    deliveries: merged.deliveries,
    users: merged.users,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from(TABLE_NAME)
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    throw error;
  }

  return merged;
}

/**
 * 取得 fleet_sync 表的建立 RLS SQL（用於前端初始化提示）
 * 注意：建議直接執行 docs/fleet-sync-setup-v2.sql 完成多租戶遷移
 */
export const supabaseSetupSql = `-- 請執行 docs/fleet-sync-setup-v2.sql 完成多租戶遷移
-- 此檔案僅供參考，不再使用

create table if not exists public.${TABLE_NAME} (
  user_id text primary key,
  fleet_id text,
  vehicles jsonb not null default '[]'::jsonb,
  deliveries jsonb not null default '[]'::jsonb,
  users jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.${TABLE_NAME} enable row level security;

-- 已認證用戶只能操作自己的記錄
create policy "authenticated can read own ${TABLE_NAME}"
on public.${TABLE_NAME}
for select using (auth.uid()::text = user_id);

create policy "authenticated can insert own ${TABLE_NAME}"
on public.${TABLE_NAME}
for insert with check (auth.uid()::text = user_id);

create policy "authenticated can update own ${TABLE_NAME}"
on public.${TABLE_NAME}
for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

create policy "authenticated can delete own ${TABLE_NAME}"
on public.${TABLE_NAME}
for delete using (auth.uid()::text = user_id);
`;
