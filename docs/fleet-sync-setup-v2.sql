-- ============================================================
-- Fleet Pro — 多租戶 Migration v2
-- 在 Supabase Dashboard > SQL Editor 中執行
--
-- 此 Script 執行以下操作：
--  1. 新增 user_id 欄位（對應 Clerk auth.users UUID）
--  2. 啟用 RLS，改為以 auth.uid() 隔離讀寫
--  3. 修補 storage buckets，限制為已認證用戶
--
-- ⚠️  執行前請先備份現有資料
-- ⚠️  此 migration 會讓 fleet_id = 'fleetpro-demo' 舊資料在 RLS 下被隔離，
--     但完整遷移需將舊記錄的 fleet_id 填入 user_id 後再刪除 fleet_id。
-- ============================================================

-- ============================================================
-- 第一部分：fleet_sync 表改造成多租戶結構
-- ============================================================

-- 1. 新增 user_id 欄位（將對應 Clerk auth.users.id）
alter table public.fleet_sync
add column if not exists user_id text;

-- 2. 為已有 fleet_id 的舊記錄建立 user_id 映射（可選，方便日後查詢）
--    fleetpro-demo 的舊資料先不填入 user_id，避免與新用戶衝突
--    舊記錄將在 RLS 保護下仍可被已認證管理員存取（見下方 fallback policy）

-- 3. 啟用 RLS（已啟用但重建政策）
alter table public.fleet_sync enable row level security;

-- 4. 刪除所有舊 policy
drop policy if exists "public read fleet_sync" on public.fleet_sync;
drop policy if exists "public write fleet_sync" on public.fleet_sync;
drop policy if exists "public update fleet_sync" on public.fleet_sync;

-- 5. 建立新的 RLS 政策（已認證用戶只看/寫自己的記錄）

-- 5a. SELECT：已認證用戶只能讀取 user_id 與其 auth.uid() 匹配的記錄
create policy "authenticated can read own fleet_sync"
on public.fleet_sync
for select
using (auth.uid()::text = user_id);

-- 5b. INSERT：已認證用戶只能寫入自己的記錄
create policy "authenticated can insert own fleet_sync"
on public.fleet_sync
for insert
with check (auth.uid()::text = user_id);

-- 5c. UPDATE：已認證用戶只能更新自己的記錄
create policy "authenticated can update own fleet_sync"
on public.fleet_sync
for update
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

-- 5d. DELETE：已認證用戶只能刪除自己的記錄
create policy "authenticated can delete own fleet_sync"
on public.fleet_sync
for delete
using (auth.uid()::text = user_id);

-- 6. 建立唯讀匿名政策（讓未登入用戶可看到 fleet_id 舊記錄，方便遷移期過渡）
--    ⚠️  此政策純為遷移期寬容，正式環境可移除
create policy "anon can read legacy fleet_sync"
on public.fleet_sync
for select
using (user_id is null and fleet_id = 'fleetpro-demo');

-- ============================================================
-- 第二部分：Storage Buckets 限制為已認證用戶
-- ============================================================

-- 刪除舊 vehicle-images policies
drop policy if exists "Public can upload to vehicle-images" on storage.objects;
drop policy if exists "Public can view vehicle-images" on storage.objects;
drop policy if exists "Public can update vehicle-images" on storage.objects;
drop policy if exists "Public can delete vehicle-images" on storage.objects;

-- vehicle-images：已認證用戶可上傳
create policy "Authenticated can upload vehicle-images"
on storage.objects
for insert
with check (
  bucket_id = 'vehicle-images' and auth.role() = 'authenticated'
);

-- vehicle-images：已認證用戶可讀取（車輛圖片）
create policy "Authenticated can view vehicle-images"
on storage.objects
for select
using (
  bucket_id = 'vehicle-images' and auth.role() = 'authenticated'
);

-- vehicle-images：已認證用戶可更新
create policy "Authenticated can update vehicle-images"
on storage.objects
for update
using (
  bucket_id = 'vehicle-images' and auth.role() = 'authenticated'
)
with check (
  bucket_id = 'vehicle-images' and auth.role() = 'authenticated'
);

-- vehicle-images：已認證用戶可刪除
create policy "Authenticated can delete vehicle-images"
on storage.objects
for delete
using (
  bucket_id = 'vehicle-images' and auth.role() = 'authenticated'
);

-- 刪除舊 delivery-photos policies
drop policy if exists "Public can upload to delivery-photos" on storage.objects;
drop policy if exists "Public can view delivery-photos" on storage.objects;
drop policy if exists "Public can update delivery-photos" on storage.objects;
drop policy if exists "Public can delete delivery-photos" on storage.objects;

-- delivery-photos：已認證用戶可上傳
create policy "Authenticated can upload delivery-photos"
on storage.objects
for insert
with check (
  bucket_id = 'delivery-photos' and auth.role() = 'authenticated'
);

-- delivery-photos：已認證用戶可讀取
create policy "Authenticated can view delivery-photos"
on storage.objects
for select
using (
  bucket_id = 'delivery-photos' and auth.role() = 'authenticated'
);

-- delivery-photos：已認證用戶可更新
create policy "Authenticated can update delivery-photos"
on storage.objects
for update
using (
  bucket_id = 'delivery-photos' and auth.role() = 'authenticated'
)
with check (
  bucket_id = 'delivery-photos' and auth.role() = 'authenticated'
);

-- delivery-photos：已認證用戶可刪除
create policy "Authenticated can delete delivery-photos"
on storage.objects
for delete
using (
  bucket_id = 'delivery-photos' and auth.role() = 'authenticated'
);

-- ============================================================
-- 第三部分：驗證設定
-- ============================================================

-- 查看 fleet_sync 政策
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where tablename = 'fleet_sync';

-- 查看 storage buckets 政策
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where tablename = 'objects' and schemaname = 'storage';

-- 查看 fleet_sync 表結構
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'fleet_sync'
order by ordinal_position;
