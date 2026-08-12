-- Fleet Pro - 系統設定資料表
-- 用於儲存應用程式級別的設定，以 Key-Value 格式儲存

-- 0. 刪除舊表（如果存在的話）
DROP TABLE IF EXISTS public.system_settings CASCADE;

-- 1. 建立 system_settings 表
CREATE TABLE public.system_settings (
    id text PRIMARY KEY,
    key text NOT NULL UNIQUE,
    value jsonb NOT NULL DEFAULT '{}',
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. 建立索引
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings(key);

-- 3. 啟用 RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 4. 建立 RLS 政策
-- 允許所有人讀取設定
DROP POLICY IF EXISTS "public can read system_settings" ON public.system_settings;
CREATE POLICY "public can read system_settings"
ON public.system_settings FOR SELECT
USING (true);

-- 允許所有人插入
DROP POLICY IF EXISTS "public can insert system_settings" ON public.system_settings;
CREATE POLICY "public can insert system_settings"
ON public.system_settings FOR INSERT
WITH CHECK (true);

-- 允許所有人更新
DROP POLICY IF EXISTS "public can update system_settings" ON public.system_settings;
CREATE POLICY "public can update system_settings"
ON public.system_settings FOR UPDATE
USING (true)
WITH CHECK (true);

-- 5. 自動更新 updated_at 的 Trigger
CREATE OR REPLACE FUNCTION public.handle_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER set_system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_system_settings_updated_at();

-- 6. 插入預設的儀表板圖表設定
INSERT INTO public.system_settings (id, key, value, description) VALUES
(
    'dashboard_chart_config',
    'dashboard_chart_config',
    '{
        "show_total_orders": true,
        "show_avg_duration": true,
        "show_efficiency_rate": true,
        "show_active_drivers": true,
        "chart_series_duration": true
    }'::jsonb,
    'Dashboard 圖表顯示設定，控制各項 KPI 卡片與圖表系列的顯示/隱藏'
);

-- 7. 驗證結果
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'system_settings' ORDER BY ordinal_position;
