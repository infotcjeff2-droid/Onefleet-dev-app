-- ============================================================
-- Fleet Pro Storage 設定腳本
-- 在 Supabase Dashboard > SQL Editor 中執行
-- ============================================================

-- 1. 建立 vehicle-images bucket（設為 public）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vehicle-images',
  'vehicle-images',
  true,
  null,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = null,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 2. 刪除舊的 policy（如果存在）
DROP POLICY IF EXISTS "Public can upload to vehicle-images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view vehicle-images" ON storage.objects;

-- 3. 建立上傳 policy（任何人都可以上傳圖片到此 bucket）
CREATE POLICY "Public can upload to vehicle-images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'vehicle-images' AND
  (auth.role() = 'authenticated' OR auth.role() = 'anon')
);

-- 4. 建立讀取 policy（任何人都可以讀取此 bucket 中的圖片）
CREATE POLICY "Public can view vehicle-images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'vehicle-images');

-- 5. 建立更新 policy（用於 upsert 覆蓋圖片）
DROP POLICY IF EXISTS "Public can update vehicle-images" ON storage.objects;
CREATE POLICY "Public can update vehicle-images"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'vehicle-images')
WITH CHECK (bucket_id = 'vehicle-images');

-- 6. 建立刪除 policy（可選，管理員可刪除圖片）
DROP POLICY IF EXISTS "Public can delete vehicle-images" ON storage.objects;
CREATE POLICY "Public can delete vehicle-images"
ON storage.objects
FOR DELETE
USING (bucket_id = 'vehicle-images');

-- 7. 驗證設定
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'vehicle-images';
