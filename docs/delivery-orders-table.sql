-- Fleet Pro - 共享配送單表（多租戶版本）
-- 
-- 邏輯：
-- - admin: 可查看所有公司的派單
-- - company: 派單只能指派給綁定公司的司機，且只有被選中的司機能看到
-- - driver: 只能查看自己公司且指派給自己的配送單

-- 0. 刪除舊表（如果存在的話）
DROP TABLE IF EXISTS public.delivery_orders CASCADE;

-- 1. 建立 delivery_orders 表
CREATE TABLE public.delivery_orders (
    id text PRIMARY KEY,
    order_no text NOT NULL UNIQUE,
    user_id text,  -- 創建者的 user_id (Clerk ID)
    company_id text,  -- 所屬公司 ID
    
    -- 取貨資訊
    customer_name text NOT NULL,
    customer_phone text,
    pickup_address text NOT NULL,
    pickup_contact text,
    pickup_time text NOT NULL,
    pickup_latitude numeric,
    pickup_longitude numeric,
    
    -- 送達資訊
    dropoff_address text NOT NULL,
    dropoff_contact text,
    dropoff_phone text,
    dropoff_latitude numeric,
    dropoff_longitude numeric,
    
    -- 狀態與指派
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_transit', 'delivered', 'signed', 'expired', 'cancelled')),
    assigned_driver_id text,  -- 被指派司機的 user_id
    assigned_driver_name text,
    assigned_at timestamptz,
    
    -- 簽收與照片
    signature_data text,
    signed_at timestamptz,
    signature_strokes jsonb,
    photos jsonb DEFAULT '[]',
    pickup_photos jsonb DEFAULT '[]',
    
    -- 時間戳
    picked_up_at timestamptz,
    in_transit_at timestamptz,
    delivered_at timestamptz,
    
    -- 費用
    delivery_fee numeric DEFAULT 0,
    cod_amount numeric DEFAULT 0,

    -- 物品資訊
    cargo_description text DEFAULT '',
    cargo_weight numeric DEFAULT 0,

    -- 備註
    notes text,
    
    -- 時間戳
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_deleted boolean DEFAULT false,
    is_completed boolean DEFAULT false,
    completed_at timestamptz
);

-- 2. 建立索引
CREATE INDEX IF NOT EXISTS idx_delivery_orders_user_id ON public.delivery_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_company_id ON public.delivery_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_driver_id ON public.delivery_orders(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON public.delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_pickup_time ON public.delivery_orders(pickup_time);

-- 3. 啟用 RLS
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;

-- 4. 建立 RLS 政策
-- 允許所有人讀取（所有登入用戶都能看到配送單，但前端會根據角色過濾）
DROP POLICY IF EXISTS "public can read delivery_orders" ON public.delivery_orders;
CREATE POLICY "public can read delivery_orders"
ON public.delivery_orders FOR SELECT
USING (is_deleted = false);

-- 允許所有人插入
DROP POLICY IF EXISTS "public can insert delivery_orders" ON public.delivery_orders;
CREATE POLICY "public can insert delivery_orders"
ON public.delivery_orders FOR INSERT
WITH CHECK (true);

-- 允許所有人更新
DROP POLICY IF EXISTS "public can update delivery_orders" ON public.delivery_orders;
CREATE POLICY "public can update delivery_orders"
ON public.delivery_orders FOR UPDATE
USING (true)
WITH CHECK (true);

-- 5. 如果資料庫已存在，加入新欄位
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 6. 自動更新 updated_at 的 Trigger
CREATE OR REPLACE FUNCTION public.handle_delivery_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_delivery_orders_updated_at ON public.delivery_orders;
CREATE TRIGGER set_delivery_orders_updated_at
    BEFORE UPDATE ON public.delivery_orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_delivery_orders_updated_at();

-- 6. 驗證結果
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'delivery_orders' ORDER BY ordinal_position;
