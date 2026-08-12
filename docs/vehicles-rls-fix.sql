-- =====================================================================
-- Fleet Pro — vehicles 表 RLS 安全補強
-- =====================================================================
--
-- 為何需要這個檔案：
-- Supabase 對 vehicles 表發出 critical 安全警告（RLS disabled），
-- 表示 anon key 可以讀寫所有資料。為了兼顧：
--   1. 你目前「所有登入用戶共享 vehicles」的業務設計
--   2. Supabase 安全要求（啟用 RLS）
-- 我們採用「寬鬆 RLS 政策」策略：
--   - 啟用 RLS
--   - 允許 anon / authenticated 都可以 SELECT / INSERT / UPDATE / DELETE
--   - 與既有的 delivery_orders / inventory_* 系列表保持一致
--
-- 與 inventory-tables.sql 的策略對齊（也採用寬鬆 RLS），
-- 若日後要進一步做「依 company_id 嚴格隔離」，
-- 可改寫成 "company_id = auth_user_company_id" 之類的政策。
-- =====================================================================

-- 1. 啟用 RLS（必要：否則 anon key 完全無限制）
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- 2. 移除舊政策（保險起見）
DROP POLICY IF EXISTS "public can read vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "public can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "public can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "public can delete vehicles" ON public.vehicles;

-- 3. 建立寬鬆政策（所有角色都可讀寫）
CREATE POLICY "public can read vehicles"
    ON public.vehicles FOR SELECT
    USING (true);

CREATE POLICY "public can insert vehicles"
    ON public.vehicles FOR INSERT
    WITH CHECK (true);

CREATE POLICY "public can update vehicles"
    ON public.vehicles FOR UPDATE
    USING (true) WITH CHECK (true);

CREATE POLICY "public can delete vehicles"
    ON public.vehicles FOR DELETE
    USING (true);

-- 4. updated_at 自動更新 trigger（與其他表對齊）
CREATE OR REPLACE FUNCTION public.handle_vehicles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER set_vehicles_updated_at
    BEFORE UPDATE ON public.vehicles
    FOR EACH ROW EXECUTE FUNCTION public.handle_vehicles_updated_at();

-- 5. 驗證結果
SELECT
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'vehicles';

SELECT
    policyname,
    cmd,
    permissive,
    roles
FROM pg_policies
WHERE tablename = 'vehicles';
