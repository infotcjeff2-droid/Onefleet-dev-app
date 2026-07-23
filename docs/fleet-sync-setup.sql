-- ============================================================
-- Fleet Pro Database Schema
-- 在 Supabase Dashboard > SQL Editor 中執行
-- ============================================================

-- 1. 建立 fleet_sync 資料表（用於車隊資料同步）
create table if not exists public.fleet_sync (
  fleet_id text primary key,
  vehicles jsonb not null default '[]'::jsonb,
  deliveries jsonb not null default '[]'::jsonb,
  users jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. 啟用 RLS (Row Level Security)
alter table public.fleet_sync enable row level security;

-- 3. 建立讀取 policy（公開讀取）
drop policy if exists "public read fleet_sync" on public.fleet_sync;
create policy "public read fleet_sync"
on public.fleet_sync
for select
using (true);

-- 4. 建立新增 policy（公開新增）
drop policy if exists "public write fleet_sync" on public.fleet_sync;
create policy "public write fleet_sync"
on public.fleet_sync
for insert
with check (true);

-- 5. 建立更新 policy（公開更新）
drop policy if exists "public update fleet_sync" on public.fleet_sync;
create policy "public update fleet_sync"
on public.fleet_sync
for update
using (true)
with check (true);

-- 6. 驗證設定
select 
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'fleet_sync';
