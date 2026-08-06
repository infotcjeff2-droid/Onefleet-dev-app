-- Fleet Pro - user_profile 表 RLS 政策更新
-- 執行這個檔案讓同步功能正常運作

-- 先刪除所有現有政策
DROP POLICY IF EXISTS "authenticated can read user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "authenticated can insert user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "authenticated can update user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "authenticated can delete user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "public can read user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "anyone can upsert user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "anyone can update user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "anyone can soft delete user_profile" ON public.user_profile;

-- 建立新政策：允許所有人讀取（排除已刪除的記錄）
CREATE POLICY "public can read user_profile"
ON public.user_profile FOR SELECT
USING (is_deleted = false);

-- 建立新政策：允許所有人插入
CREATE POLICY "public can insert user_profile"
ON public.user_profile FOR INSERT
WITH CHECK (true);

-- 建立新政策：允許所有人更新
CREATE POLICY "public can update user_profile"
ON public.user_profile FOR UPDATE
USING (true)
WITH CHECK (true);

-- 驗證政策
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE tablename = 'user_profile';
