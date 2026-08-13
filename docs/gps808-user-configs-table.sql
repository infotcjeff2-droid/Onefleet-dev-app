-- Fleet Pro - GPS808 用戶配置資料表
-- 每個用戶儲存自己的 GPS808 API 連線設定
-- 用途：實作多設備同步（用戶只需輸入一次憑證）

-- 0. 刪除舊表（如果存在）
DROP TABLE IF EXISTS public.gps808_user_configs CASCADE;

-- 1. 建立資料表
CREATE TABLE public.gps808_user_configs (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    server_url text NOT NULL,
    account text NOT NULL,
    password text NOT NULL,
    is_connected boolean NOT NULL DEFAULT false,
    last_connected_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. 索引
CREATE INDEX IF NOT EXISTS idx_gps808_user_configs_user_id
    ON public.gps808_user_configs(user_id);

-- 3. 啟用 RLS
ALTER TABLE public.gps808_user_configs ENABLE ROW LEVEL SECURITY;

-- 4. RLS 政策
-- 任何人可讀取（透過應用層控制權限）
DROP POLICY IF EXISTS "public read gps808_user_configs" ON public.gps808_user_configs;
CREATE POLICY "public read gps808_user_configs"
ON public.gps808_user_configs FOR SELECT
USING (true);

-- 任何人可插入
DROP POLICY IF EXISTS "public insert gps808_user_configs" ON public.gps808_user_configs;
CREATE POLICY "public insert gps808_user_configs"
ON public.gps808_user_configs FOR INSERT
WITH CHECK (true);

-- 任何人可更新
DROP POLICY IF EXISTS "public update gps808_user_configs" ON public.gps808_user_configs;
CREATE POLICY "public update gps808_user_configs"
ON public.gps808_user_configs FOR UPDATE
USING (true)
WITH CHECK (true);

-- 任何人可刪除（用戶主動中斷連接）
DROP POLICY IF EXISTS "public delete gps808_user_configs" ON public.gps808_user_configs;
CREATE POLICY "public delete gps808_user_configs"
ON public.gps808_user_configs FOR DELETE
USING (true);

-- 5. 自動更新 updated_at 的 Trigger
CREATE OR REPLACE FUNCTION public.handle_gps808_user_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_gps808_user_configs_updated_at
    ON public.gps808_user_configs;
CREATE TRIGGER set_gps808_user_configs_updated_at
    BEFORE UPDATE ON public.gps808_user_configs
    FOR EACH ROW EXECUTE FUNCTION public.handle_gps808_user_configs_updated_at();

-- 6. 驗證結果
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'gps808_user_configs'
ORDER BY ordinal_position;