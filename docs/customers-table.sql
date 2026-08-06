-- Fleet Pro - 客戶資料表（多租戶版本）

-- 1. 建立 customers 表
CREATE TABLE IF NOT EXISTS public.customers (
    id text PRIMARY KEY,
    user_id text,
    company_id text,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    delivery_addresses jsonb DEFAULT '[]',
    notes text,
    total_orders integer DEFAULT 0,
    last_order_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_deleted boolean DEFAULT false
);

-- 2. 建立索引
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON public.customers(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

-- 3. 啟用 RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 4. 建立 RLS 政策
DROP POLICY IF EXISTS "public_can_read_customers" ON public.customers;
CREATE POLICY "public_can_read_customers" ON public.customers FOR SELECT USING (is_deleted = false);

DROP POLICY IF EXISTS "public_can_insert_customers" ON public.customers;
CREATE POLICY "public_can_insert_customers" ON public.customers FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "public_can_update_customers" ON public.customers;
CREATE POLICY "public_can_update_customers" ON public.customers FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_can_delete_customers" ON public.customers;
CREATE POLICY "public_can_delete_customers" ON public.customers FOR DELETE USING (true);

-- 5. Trigger 函數
DROP FUNCTION IF EXISTS public.handle_customers_updated_at();
CREATE FUNCTION public.handle_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. 建立 Trigger
DROP TRIGGER IF EXISTS set_customers_updated_at ON public.customers;
CREATE TRIGGER set_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.handle_customers_updated_at();

-- 7. 驗證
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customers' ORDER BY ordinal_position;
