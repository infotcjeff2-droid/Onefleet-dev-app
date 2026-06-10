import { Vehicle } from '@/types';
import { DeliveryOrder, mockDeliveries } from '@/constants/mockData';
import { mockVehicles } from '@/constants/mockData';
import { supabase } from './supabase';

export const SYNC_FLEET_ID = 'fleetpro-demo';
const TABLE_NAME = 'fleet_sync';

export const hasSupabaseEnv = Boolean(supabase);

export interface FleetSyncSnapshot {
  vehicles: Vehicle[];
  deliveries: DeliveryOrder[];
}

interface SyncEnvelope {
  fleet_id: string;
  vehicles: Vehicle[];
  deliveries: DeliveryOrder[];
  updated_at?: string;
}

function ensureClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  return supabase;
}

function normalizeSnapshot(snapshot?: Partial<FleetSyncSnapshot> | null): FleetSyncSnapshot {
  return {
    vehicles: Array.isArray(snapshot?.vehicles) ? snapshot.vehicles : mockVehicles,
    deliveries: Array.isArray(snapshot?.deliveries) ? snapshot.deliveries : mockDeliveries,
  };
}

export async function fetchFleetSnapshot(): Promise<FleetSyncSnapshot | null> {
  const client = ensureClient();
  const { data, error } = await client
    .from(TABLE_NAME)
    .select('fleet_id, vehicles, deliveries, updated_at')
    .eq('fleet_id', SYNC_FLEET_ID)
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
  });
}

export async function pushFleetSnapshot(snapshot: Partial<FleetSyncSnapshot>) {
  const client = ensureClient();
  const currentRemote = await fetchFleetSnapshot().catch(() => null);
  const merged = normalizeSnapshot({
    vehicles: snapshot.vehicles ?? currentRemote?.vehicles,
    deliveries: snapshot.deliveries ?? currentRemote?.deliveries,
  });

  const payload: SyncEnvelope = {
    fleet_id: SYNC_FLEET_ID,
    vehicles: merged.vehicles,
    deliveries: merged.deliveries,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client.from(TABLE_NAME).upsert(payload, { onConflict: 'fleet_id' });

  if (error) {
    throw error;
  }

  return merged;
}

export const supabaseSetupSql = `create table if not exists public.${TABLE_NAME} (
  fleet_id text primary key,
  vehicles jsonb not null default '[]'::jsonb,
  deliveries jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.${TABLE_NAME} add column if not exists vehicles jsonb not null default '[]'::jsonb;
alter table public.${TABLE_NAME} add column if not exists deliveries jsonb not null default '[]'::jsonb;
alter table public.${TABLE_NAME} enable row level security;

drop policy if exists "public read ${TABLE_NAME}" on public.${TABLE_NAME};
create policy "public read ${TABLE_NAME}"
on public.${TABLE_NAME}
for select
using (true);

drop policy if exists "public write ${TABLE_NAME}" on public.${TABLE_NAME};
create policy "public write ${TABLE_NAME}"
on public.${TABLE_NAME}
for insert
with check (true);

drop policy if exists "public update ${TABLE_NAME}" on public.${TABLE_NAME};
create policy "public update ${TABLE_NAME}"
on public.${TABLE_NAME}
for update
using (true)
with check (true);
`;
