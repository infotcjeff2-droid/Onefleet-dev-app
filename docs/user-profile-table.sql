-- ============================================================
-- Fleet Pro — user_profile 表
-- 用於儲存 App 內管理的使用者（managed users）
-- 與 Clerk 的 OAuth 帳號分開儲存
-- ============================================================

-- ============================================================
-- 第一部分：建立 user_profile 表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_profile (
    id text PRIMARY KEY,
    email text NOT NULL,
    name text NOT NULL,
    name_zh text,
    name_en text,
    phone text,
    avatar text,
    address text,
    role text NOT NULL CHECK (role IN ('admin', 'company', 'driver', 'user')),
    company_id text,
    password text,                     -- 帳號密碼（明碼，僅供開發/本地驗證使用；生產環境應改用雜湊）
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_deleted boolean DEFAULT false
);

-- 建立索引提升查詢效能
CREATE INDEX IF NOT EXISTS idx_user_profile_email ON public.user_profile(email);
CREATE INDEX IF NOT EXISTS idx_user_profile_role ON public.user_profile(role);
CREATE INDEX IF NOT EXISTS idx_user_profile_company_id ON public.user_profile(company_id);

-- ============================================================
-- 第二部分：啟用 RLS
-- ============================================================

ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;

-- 刪除舊政策（如果存在）
DROP POLICY IF EXISTS "public can read user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "public can insert user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "public can update user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "public can delete user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "anon can read user_profile" ON public.user_profile;
DROP POLICY IF EXISTS "authenticated can manage user_profile" ON public.user_profile;

-- ============================================================
-- 第三部分：建立 RLS 政策
-- ============================================================

-- 3a. SELECT：已認證用戶可以讀取所有未刪除的使用者（管理員視角）
CREATE POLICY "authenticated can read user_profile"
ON public.user_profile
FOR SELECT
USING (auth.role() = 'authenticated' AND is_deleted = false);

-- 3b. INSERT：已認證用戶可以新增使用者
CREATE POLICY "authenticated can insert user_profile"
ON public.user_profile
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- 3c. UPDATE：已認證用戶可以更新使用者（軟刪除用 is_deleted 欄位）
CREATE POLICY "authenticated can update user_profile"
ON public.user_profile
FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- 3d. DELETE：已認證用戶可以刪除使用者（支援軟刪除）
CREATE POLICY "authenticated can delete user_profile"
ON public.user_profile
FOR DELETE
USING (auth.role() = 'authenticated');

-- ============================================================
-- 第四部分：建立 Updated At Trigger
-- ============================================================

-- 創建自動更新 updated_at 的函數
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 刪除舊 trigger（如果存在）
DROP TRIGGER IF EXISTS set_user_profile_updated_at ON public.user_profile;

-- 創建 trigger
CREATE TRIGGER set_user_profile_updated_at
    BEFORE UPDATE ON public.user_profile
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 第五部分：驗證設定
-- ============================================================

-- 查看錶結構
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_profile'
ORDER BY ordinal_position;

-- 查看 RLS 政策
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'user_profile';

-- ============================================================
-- 第六部分：資料遷移（可選）
-- 如果 fleet_sync 表有 users 資料，可以一次性遷移到 user_profile 表
-- ============================================================

/*
-- 從 fleet_sync 遷移 users 資料到 user_profile（一次性）
INSERT INTO public.user_profile (id, email, name, name_zh, name_en, phone, avatar, address, role, company_id, created_at, updated_at)
SELECT 
    u->>'id' as id,
    u->>'email' as email,
    u->>'name' as name,
    u->>'nameZh' as name_zh,
    u->>'nameEn' as name_en,
    u->>'phone' as phone,
    u->>'avatar' as avatar,
    u->>'address' as address,
    COALESCE(u->>'role', 'user') as role,
    u->>'companyId' as company_id,
    now() as created_at,
    now() as updated_at
FROM (
    SELECT jsonb_array_elements(users) as u
    FROM public.fleet_sync
    WHERE users IS NOT NULL AND jsonb_array_length(users) > 0
) sub
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    name_zh = EXCLUDED.name_zh,
    name_en = EXCLUDED.name_en,
    phone = EXCLUDED.phone,
    avatar = EXCLUDED.avatar,
    address = EXCLUDED.address,
    role = EXCLUDED.role,
    company_id = EXCLUDED.company_id,
    updated_at = now();
*/
