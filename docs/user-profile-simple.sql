-- Fleet Pro - user_profile 表（簡化版）
-- 在 Supabase SQL Editor 中執行這一個檔案即可

-- 1. 建立 user_profile 表
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
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_deleted boolean DEFAULT false
);

-- 2. 建立索引
CREATE INDEX IF NOT EXISTS idx_user_profile_email ON public.user_profile(email);
CREATE INDEX IF NOT EXISTS idx_user_profile_role ON public.user_profile(role);

-- 3. 啟用 RLS
ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;

-- 4. 建立 RLS 政策（已認證用戶可讀寫）
DROP POLICY IF EXISTS "authenticated can read user_profile" ON public.user_profile;
CREATE POLICY "authenticated can read user_profile"
ON public.user_profile FOR SELECT
USING (auth.role() = 'authenticated' AND is_deleted = false);

DROP POLICY IF EXISTS "authenticated can insert user_profile" ON public.user_profile;
CREATE POLICY "authenticated can insert user_profile"
ON public.user_profile FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated can update user_profile" ON public.user_profile;
CREATE POLICY "authenticated can update user_profile"
ON public.user_profile FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated can delete user_profile" ON public.user_profile;
CREATE POLICY "authenticated can delete user_profile"
ON public.user_profile FOR DELETE
USING (auth.role() = 'authenticated');

-- 5. 自動更新 updated_at 的 Trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_user_profile_updated_at ON public.user_profile;
CREATE TRIGGER set_user_profile_updated_at
    BEFORE UPDATE ON public.user_profile
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 6. 驗證結果
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_profile' ORDER BY ordinal_position;
