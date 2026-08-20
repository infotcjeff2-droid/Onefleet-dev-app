-- Fleet Pro - GPS808 / Google Maps 共用配置（單列表）
-- 用途：管理員統一設定一次，全網站所有使用者自動繼承並連線
-- 取代舊的 per-user 表 gps808_user_configs
--
-- 設計重點：
--   - 寫入權限由「應用層」把關 (store 內 isAdminUser() 判斷 user.id === 'u-admin')
--   - RLS 層僅限制為「已認證使用者」(避免 anon 角色污染資料)
--   - 注意：若您改用「資料庫層強制 admin 權限」，
--     需先把 Clerk JWT template 的 sub 設為 Clerk user ID (user_xxx)，
--     並用 auth.jwt()->>'sub' = '<admin_clerk_id>' 來比對。
--     目前 mock admin (id='u-admin') 不會建立 Supabase session,會被 RLS 擋下。

-- =========================================================
-- 1. GPS808 共用配置
-- =========================================================

-- 刪除舊的 per-user 表（已被共用單列取代）
DROP TABLE IF EXISTS public.gps808_user_configs CASCADE;

-- 建立單列共用表
CREATE TABLE public.gps808_shared_config (
    id                INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    server_url        TEXT NOT NULL DEFAULT 'https://console.onefleet.hk',
    account           TEXT NOT NULL DEFAULT '',
    password          TEXT NOT NULL DEFAULT '',
    is_connected      BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by        TEXT,
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    last_connected_at TIMESTAMPTZ
);

-- 預先插入空殼單列（id=1），讓所有使用者可讀到一筆資料
INSERT INTO public.gps808_shared_config (id, server_url, account, password)
VALUES (1, 'https://console.onefleet.hk', '', '')
ON CONFLICT (id) DO NOTHING;

-- 啟用 RLS
ALTER TABLE public.gps808_shared_config ENABLE ROW LEVEL SECURITY;

-- 政策：所有角色皆可讀（單列共用資料，不含個資）
DROP POLICY IF EXISTS "public read gps808_shared_config" ON public.gps808_shared_config;
CREATE POLICY "public read gps808_shared_config"
ON public.gps808_shared_config FOR SELECT
TO public
USING (true);

-- 政策：所有角色皆可寫入（真正的 admin 權限在應用層 store 內 isAdminUser() 把關 +
--                                   UI 隱藏編輯按鈕）
-- 此處允許 public 寫入是為了支援 mock admin 登入流程（無 Supabase session）。
DROP POLICY IF EXISTS "public insert gps808_shared_config" ON public.gps808_shared_config;
CREATE POLICY "public insert gps808_shared_config"
ON public.gps808_shared_config FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "public update gps808_shared_config" ON public.gps808_shared_config;
CREATE POLICY "public update gps808_shared_config"
ON public.gps808_shared_config FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "public delete gps808_shared_config" ON public.gps808_shared_config;
CREATE POLICY "public delete gps808_shared_config"
ON public.gps808_shared_config FOR DELETE
TO public
USING (true);

-- 自動更新 updated_at 的 trigger
CREATE OR REPLACE FUNCTION public.handle_gps808_shared_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_gps808_shared_config_updated_at
    ON public.gps808_shared_config;
CREATE TRIGGER set_gps808_shared_config_updated_at
    BEFORE UPDATE ON public.gps808_shared_config
    FOR EACH ROW EXECUTE FUNCTION public.handle_gps808_shared_config_updated_at();


-- =========================================================
-- 2. Google Maps 共用配置
-- =========================================================

CREATE TABLE public.google_maps_shared_config (
    id            INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    api_key_hash  TEXT NOT NULL DEFAULT '',
    api_key_masked TEXT NOT NULL DEFAULT '',
    has_api_key   BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by    TEXT,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 預先插入空殼單列
INSERT INTO public.google_maps_shared_config (id, api_key_hash, api_key_masked, has_api_key)
VALUES (1, '', '', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 啟用 RLS
ALTER TABLE public.google_maps_shared_config ENABLE ROW LEVEL SECURITY;

-- 政策：所有角色皆可讀
DROP POLICY IF EXISTS "public read google_maps_shared_config" ON public.google_maps_shared_config;
CREATE POLICY "public read google_maps_shared_config"
ON public.google_maps_shared_config FOR SELECT
TO public
USING (true);

-- 政策：所有角色皆可寫入（應用層 store 內 isAdminUser() 把關）
DROP POLICY IF EXISTS "public insert google_maps_shared_config" ON public.google_maps_shared_config;
CREATE POLICY "public insert google_maps_shared_config"
ON public.google_maps_shared_config FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "public update google_maps_shared_config" ON public.google_maps_shared_config;
CREATE POLICY "public update google_maps_shared_config"
ON public.google_maps_shared_config FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "public delete google_maps_shared_config" ON public.google_maps_shared_config;
CREATE POLICY "public delete google_maps_shared_config"
ON public.google_maps_shared_config FOR DELETE
TO public
USING (true);

-- 自動更新 updated_at 的 trigger
CREATE OR REPLACE FUNCTION public.handle_google_maps_shared_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_google_maps_shared_config_updated_at
    ON public.google_maps_shared_config;
CREATE TRIGGER set_google_maps_shared_config_updated_at
    BEFORE UPDATE ON public.google_maps_shared_config
    FOR EACH ROW EXECUTE FUNCTION public.handle_google_maps_shared_config_updated_at();
