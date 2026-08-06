-- ============================================================
-- Fleet Pro — 共享車輛表 Migration
-- 在 Supabase Dashboard > SQL Editor 中執行
--
-- 此 Script 執行以下操作：
--  1. 建立共享 vehicles 表（所有已認證用戶共享）
--  2. 停用 RLS（因為是共享資料庫，所有用戶都需要讀寫）
-- ============================================================

-- ============================================================
-- 第一部分：建立共享 vehicles 表
-- ============================================================

create table if not exists public.vehicles (
  id text primary key,
  make text not null default '',
  model text not null default '',
  plate_number text not null default '',
  color text not null default '',
  year integer,
  vin text,
  status text not null default 'inactive',
  gps_device_id text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 第二部分：停用 RLS（共享資料庫不需要 RLS）
-- ============================================================

-- 停用 RLS（所有已認證用戶都可以讀寫）
alter table public.vehicles disable row level security;

-- ============================================================
-- 第三部分：驗證設定
-- ============================================================

-- 查看 vehicles 表結構
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'vehicles'
order by ordinal_position;

-- 查看 RLS 狀態
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'vehicles';
