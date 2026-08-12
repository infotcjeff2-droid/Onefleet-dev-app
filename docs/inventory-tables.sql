-- =====================================================================
-- Fleet Pro — 「庫存與配送」共享表 (多租戶 / 跨裝置同步)
--
-- 設計原則
-- 1. 以 company_id 作為多租戶隔離依據（與 user_profile / delivery_orders 一致）
-- 2. 沿用 fleet_sync / delivery_orders 的 RLS 寬鬆政策（前端依角色過濾）
--    - 後續若需要更嚴格 RLS（以 auth.uid() 對應 user_profile.company_id），
--      可再寫進階 policy；當前策略與現有設計一致，避免一下子改太多
-- 3. 所有表都加 user_id（建立者）、created_at/updated_at、is_deleted
-- 4. 提供統一的 handle_updated_at() trigger
--
-- 涵蓋實體（7 張表）
--   1. inventory_warehouses      倉庫
--   2. inventory_items           庫存物品 (SKU)
--   3. inventory_warehouse_stocks 倉庫 ↔ 物品 庫存量
--   4. inventory_trucks          貨車
--   5. inventory_replenishment_orders 補貨訂單
--   6. inventory_stock_alerts    庫存警報
--   7. inventory_dispatch_orders 智能配送調度單
-- =====================================================================

-- ============================================================
-- 1. inventory_warehouses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_warehouses (
    id text PRIMARY KEY,
    user_id text,
    company_id text,
    name text NOT NULL,
    address text NOT NULL DEFAULT '',
    image_url text,
    total_area numeric,
    storage_capacity numeric,
    current_stock_level numeric DEFAULT 0,
    manager text,
    phone text,
    notes text,
    internal_lat numeric,
    internal_lng numeric,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_deleted boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_inventory_warehouses_company_id ON public.inventory_warehouses(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouses_user_id ON public.inventory_warehouses(user_id);

ALTER TABLE public.inventory_warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public can read inventory_warehouses" ON public.inventory_warehouses;
DROP POLICY IF EXISTS "public can insert inventory_warehouses" ON public.inventory_warehouses;
DROP POLICY IF EXISTS "public can update inventory_warehouses" ON public.inventory_warehouses;
DROP POLICY IF EXISTS "public can delete inventory_warehouses" ON public.inventory_warehouses;

CREATE POLICY "public can read inventory_warehouses"
    ON public.inventory_warehouses FOR SELECT
    USING (is_deleted = false);
CREATE POLICY "public can insert inventory_warehouses"
    ON public.inventory_warehouses FOR INSERT
    WITH CHECK (true);
CREATE POLICY "public can update inventory_warehouses"
    ON public.inventory_warehouses FOR UPDATE
    USING (true) WITH CHECK (true);
CREATE POLICY "public can delete inventory_warehouses"
    ON public.inventory_warehouses FOR DELETE
    USING (true);

DROP TRIGGER IF EXISTS set_inventory_warehouses_updated_at ON public.inventory_warehouses;
CREATE TRIGGER set_inventory_warehouses_updated_at
    BEFORE UPDATE ON public.inventory_warehouses
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 2. inventory_items
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id text PRIMARY KEY,
    user_id text,
    company_id text,
    name text NOT NULL,
    sku text,
    category text,
    unit_weight numeric DEFAULT 0,
    total_quantity numeric DEFAULT 0,
    image_url text,
    default_warehouse_id text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_deleted boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_company_id ON public.inventory_items(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON public.inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON public.inventory_items(category);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public can read inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "public can insert inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "public can update inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "public can delete inventory_items" ON public.inventory_items;

CREATE POLICY "public can read inventory_items"
    ON public.inventory_items FOR SELECT
    USING (is_deleted = false);
CREATE POLICY "public can insert inventory_items"
    ON public.inventory_items FOR INSERT
    WITH CHECK (true);
CREATE POLICY "public can update inventory_items"
    ON public.inventory_items FOR UPDATE
    USING (true) WITH CHECK (true);
CREATE POLICY "public can delete inventory_items"
    ON public.inventory_items FOR DELETE
    USING (true);

DROP TRIGGER IF EXISTS set_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER set_inventory_items_updated_at
    BEFORE UPDATE ON public.inventory_items
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 3. inventory_warehouse_stocks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_warehouse_stocks (
    id text PRIMARY KEY,
    user_id text,
    company_id text,
    warehouse_id text NOT NULL,
    item_id text NOT NULL,
    quantity numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_deleted boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_inventory_stocks_company_id ON public.inventory_warehouse_stocks(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stocks_warehouse_id ON public.inventory_warehouse_stocks(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stocks_item_id ON public.inventory_warehouse_stocks(item_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_stocks_wh_item
    ON public.inventory_warehouse_stocks(warehouse_id, item_id)
    WHERE is_deleted = false;

ALTER TABLE public.inventory_warehouse_stocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public can read inventory_warehouse_stocks" ON public.inventory_warehouse_stocks;
DROP POLICY IF EXISTS "public can insert inventory_warehouse_stocks" ON public.inventory_warehouse_stocks;
DROP POLICY IF EXISTS "public can update inventory_warehouse_stocks" ON public.inventory_warehouse_stocks;
DROP POLICY IF EXISTS "public can delete inventory_warehouse_stocks" ON public.inventory_warehouse_stocks;

CREATE POLICY "public can read inventory_warehouse_stocks"
    ON public.inventory_warehouse_stocks FOR SELECT
    USING (is_deleted = false);
CREATE POLICY "public can insert inventory_warehouse_stocks"
    ON public.inventory_warehouse_stocks FOR INSERT
    WITH CHECK (true);
CREATE POLICY "public can update inventory_warehouse_stocks"
    ON public.inventory_warehouse_stocks FOR UPDATE
    USING (true) WITH CHECK (true);
CREATE POLICY "public can delete inventory_warehouse_stocks"
    ON public.inventory_warehouse_stocks FOR DELETE
    USING (true);

DROP TRIGGER IF EXISTS set_inventory_stocks_updated_at ON public.inventory_warehouse_stocks;
CREATE TRIGGER set_inventory_stocks_updated_at
    BEFORE UPDATE ON public.inventory_warehouse_stocks
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 4. inventory_trucks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_trucks (
    id text PRIMARY KEY,
    user_id text,
    company_id text,
    plate_number text NOT NULL,
    max_weight_capacity numeric DEFAULT 0,
    current_load numeric DEFAULT 0,
    status text NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'busy', 'maintenance')),
    assigned_driver_id text,
    assigned_driver_name text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_deleted boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_inventory_trucks_company_id ON public.inventory_trucks(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_trucks_plate ON public.inventory_trucks(plate_number);
CREATE INDEX IF NOT EXISTS idx_inventory_trucks_status ON public.inventory_trucks(status);

ALTER TABLE public.inventory_trucks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public can read inventory_trucks" ON public.inventory_trucks;
DROP POLICY IF EXISTS "public can insert inventory_trucks" ON public.inventory_trucks;
DROP POLICY IF EXISTS "public can update inventory_trucks" ON public.inventory_trucks;
DROP POLICY IF EXISTS "public can delete inventory_trucks" ON public.inventory_trucks;

CREATE POLICY "public can read inventory_trucks"
    ON public.inventory_trucks FOR SELECT
    USING (is_deleted = false);
CREATE POLICY "public can insert inventory_trucks"
    ON public.inventory_trucks FOR INSERT
    WITH CHECK (true);
CREATE POLICY "public can update inventory_trucks"
    ON public.inventory_trucks FOR UPDATE
    USING (true) WITH CHECK (true);
CREATE POLICY "public can delete inventory_trucks"
    ON public.inventory_trucks FOR DELETE
    USING (true);

DROP TRIGGER IF EXISTS set_inventory_trucks_updated_at ON public.inventory_trucks;
CREATE TRIGGER set_inventory_trucks_updated_at
    BEFORE UPDATE ON public.inventory_trucks
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 5. inventory_replenishment_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_replenishment_orders (
    id text PRIMARY KEY,
    user_id text,
    company_id text,
    item_id text NOT NULL,
    item_name text NOT NULL,
    warehouse_id text NOT NULL,
    warehouse_name text NOT NULL,
    deficit_quantity numeric DEFAULT 0,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'ordered', 'shipped', 'received')),
    supplier_id text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_deleted boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_inventory_replenishment_company_id ON public.inventory_replenishment_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_replenishment_status ON public.inventory_replenishment_orders(status);
CREATE INDEX IF NOT EXISTS idx_inventory_replenishment_item ON public.inventory_replenishment_orders(item_id);

ALTER TABLE public.inventory_replenishment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public can read inventory_replenishment_orders" ON public.inventory_replenishment_orders;
DROP POLICY IF EXISTS "public can insert inventory_replenishment_orders" ON public.inventory_replenishment_orders;
DROP POLICY IF EXISTS "public can update inventory_replenishment_orders" ON public.inventory_replenishment_orders;
DROP POLICY IF EXISTS "public can delete inventory_replenishment_orders" ON public.inventory_replenishment_orders;

CREATE POLICY "public can read inventory_replenishment_orders"
    ON public.inventory_replenishment_orders FOR SELECT
    USING (is_deleted = false);
CREATE POLICY "public can insert inventory_replenishment_orders"
    ON public.inventory_replenishment_orders FOR INSERT
    WITH CHECK (true);
CREATE POLICY "public can update inventory_replenishment_orders"
    ON public.inventory_replenishment_orders FOR UPDATE
    USING (true) WITH CHECK (true);
CREATE POLICY "public can delete inventory_replenishment_orders"
    ON public.inventory_replenishment_orders FOR DELETE
    USING (true);

DROP TRIGGER IF EXISTS set_inventory_replenishment_updated_at ON public.inventory_replenishment_orders;
CREATE TRIGGER set_inventory_replenishment_updated_at
    BEFORE UPDATE ON public.inventory_replenishment_orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 6. inventory_stock_alerts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_stock_alerts (
    id text PRIMARY KEY,
    user_id text,
    company_id text,
    item_id text NOT NULL,
    item_name text NOT NULL,
    warehouse_id text NOT NULL,
    warehouse_name text NOT NULL,
    requested_quantity numeric DEFAULT 0,
    available_quantity numeric DEFAULT 0,
    deficit_quantity numeric DEFAULT 0,
    delivery_id text,
    is_resolved boolean DEFAULT false,
    resolved_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_deleted boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_inventory_alerts_company_id ON public.inventory_stock_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_item ON public.inventory_stock_alerts(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_resolved ON public.inventory_stock_alerts(is_resolved);

ALTER TABLE public.inventory_stock_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public can read inventory_stock_alerts" ON public.inventory_stock_alerts;
DROP POLICY IF EXISTS "public can insert inventory_stock_alerts" ON public.inventory_stock_alerts;
DROP POLICY IF EXISTS "public can update inventory_stock_alerts" ON public.inventory_stock_alerts;
DROP POLICY IF EXISTS "public can delete inventory_stock_alerts" ON public.inventory_stock_alerts;

CREATE POLICY "public can read inventory_stock_alerts"
    ON public.inventory_stock_alerts FOR SELECT
    USING (is_deleted = false);
CREATE POLICY "public can insert inventory_stock_alerts"
    ON public.inventory_stock_alerts FOR INSERT
    WITH CHECK (true);
CREATE POLICY "public can update inventory_stock_alerts"
    ON public.inventory_stock_alerts FOR UPDATE
    USING (true) WITH CHECK (true);
CREATE POLICY "public can delete inventory_stock_alerts"
    ON public.inventory_stock_alerts FOR DELETE
    USING (true);

DROP TRIGGER IF EXISTS set_inventory_alerts_updated_at ON public.inventory_stock_alerts;
CREATE TRIGGER set_inventory_alerts_updated_at
    BEFORE UPDATE ON public.inventory_stock_alerts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 7. inventory_dispatch_orders (智能配送調度單)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_dispatch_orders (
    id text PRIMARY KEY,
    user_id text,
    company_id text,
    delivery_id text NOT NULL,
    truck_id text NOT NULL,
    driver_id text,
    driver_name text,
    warehouse_id text,
    assigned_items jsonb DEFAULT '[]',
    total_weight numeric DEFAULT 0,
    route_sequence text[] DEFAULT ARRAY[]::text[],
    estimated_distance numeric DEFAULT 0,
    estimated_duration numeric DEFAULT 0,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_transit', 'completed', 'cancelled')),
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_deleted boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_inventory_dispatch_company_id ON public.inventory_dispatch_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_dispatch_truck ON public.inventory_dispatch_orders(truck_id);
CREATE INDEX IF NOT EXISTS idx_inventory_dispatch_status ON public.inventory_dispatch_orders(status);
CREATE INDEX IF NOT EXISTS idx_inventory_dispatch_delivery ON public.inventory_dispatch_orders(delivery_id);

ALTER TABLE public.inventory_dispatch_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public can read inventory_dispatch_orders" ON public.inventory_dispatch_orders;
DROP POLICY IF EXISTS "public can insert inventory_dispatch_orders" ON public.inventory_dispatch_orders;
DROP POLICY IF EXISTS "public can update inventory_dispatch_orders" ON public.inventory_dispatch_orders;
DROP POLICY IF EXISTS "public can delete inventory_dispatch_orders" ON public.inventory_dispatch_orders;

CREATE POLICY "public can read inventory_dispatch_orders"
    ON public.inventory_dispatch_orders FOR SELECT
    USING (is_deleted = false);
CREATE POLICY "public can insert inventory_dispatch_orders"
    ON public.inventory_dispatch_orders FOR INSERT
    WITH CHECK (true);
CREATE POLICY "public can update inventory_dispatch_orders"
    ON public.inventory_dispatch_orders FOR UPDATE
    USING (true) WITH CHECK (true);
CREATE POLICY "public can delete inventory_dispatch_orders"
    ON public.inventory_dispatch_orders FOR DELETE
    USING (true);

DROP TRIGGER IF EXISTS set_inventory_dispatch_updated_at ON public.inventory_dispatch_orders;
CREATE TRIGGER set_inventory_dispatch_updated_at
    BEFORE UPDATE ON public.inventory_dispatch_orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 統一 handle_updated_at() 函式（與 user_profile-table.sql 共用定義）
-- 若之前已建立 user_profile / delivery_orders 時定義過，
-- 這裡用 OR REPLACE 安全地覆蓋同一個函式。
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 驗證
-- ============================================================
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'inventory_warehouses',
    'inventory_items',
    'inventory_warehouse_stocks',
    'inventory_trucks',
    'inventory_replenishment_orders',
    'inventory_stock_alerts',
    'inventory_dispatch_orders'
  )
ORDER BY table_name, ordinal_position;
