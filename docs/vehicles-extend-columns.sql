-- ============================================================
-- Fleet Pro — vehicles 表欄位擴充 Migration
-- 在 Supabase Dashboard > SQL Editor 中執行
--
-- 此 Migration 新增以下欄位至 public.vehicles 表：
--   fuel_type, transmission, mileage, body_type,
--   purchase_date, insurance_expiry, registration_expiry,
--   notes, assigned_driver_id
--
-- 執行前請確認 vehicles 表已存在（由 vehicles-shared-table.sql 建立）
-- ============================================================

-- 1. 新增缺少的欄位（if not exists 語法讓重複執行不會失敗）
alter table public.vehicles
  add column if not exists fuel_type text not null default 'gasoline',
  add column if not exists transmission text not null default 'automatic',
  add column if not exists mileage integer not null default 0,
  add column if not exists body_type text not null default 'sedan',
  add column if not exists purchase_date text not null default '',
  add column if not exists insurance_expiry text not null default '',
  add column if not exists registration_expiry text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists assigned_driver_id text;

-- 2. 確認 RLS 仍為停用（共享車輛資料庫不需要 RLS）
--    如需重新啟用 RLS，可參考 vehicles-shared-table.sql 的設定
alter table public.vehicles disable row level security;

-- 3. 建立複合索引以加速常見查詢
create index if not exists idx_vehicles_plate_number on public.vehicles (plate_number);
create index if not exists idx_vehicles_status on public.vehicles (status);
create index if not exists idx_vehicles_assigned_driver_id on public.vehicles (assigned_driver_id);

-- 4. 驗證：查看 vehicles 表結構
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'vehicles'
order by ordinal_position;

-- 5. 驗證：查看 RLS 狀態
select
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'vehicles';
