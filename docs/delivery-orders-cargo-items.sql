-- Fleet Pro - 配送單表新增「物品清單 + 來源倉庫」欄位
--
-- 動機：
-- 詳情頁需要顯示每筆配送單「選擇了哪些物品（圖、名、數量、單重、總重）」以及「來源倉庫」。
-- 原本 App 只把 `cargo_description` 存成拼接字串、`cargo_weight` 存成總重，無法還原原始物品清單。
-- 為了不破壞既有資料與 schema 向下相容，這次新增三個欄位（皆可為 NULL）：
--   1. cargo_items      jsonb  - DeliveryCargoItem[] 的 JSON 快照（圖、數量、單重、當下庫存）
--   2. warehouse_id     text   - 出貨倉庫 ID（保留以利後續追溯）
--   3. warehouse_name   text   - 出貨倉庫名稱（建立時快照，避免詳情頁需要再查 Warehouse 表）
--
-- 既有行為：
-- - 不影響 `cargo_description` / `cargo_weight` 欄位（依然寫入，讓舊介面 / 列表 / 快速新增都能運作）
-- - 既有列不會自動回填（NULL 即可，App 端的 CargoItemsList 元件已有 fallback 顯示舊字串）

-- 1. 新增欄位（皆可為 NULL / 預設空）
ALTER TABLE public.delivery_orders
    ADD COLUMN IF NOT EXISTS cargo_items    jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS warehouse_id   text,
    ADD COLUMN IF NOT EXISTS warehouse_name text;

-- 2. 對 warehouse_id 建索引（後續可依倉庫查詢派單）
CREATE INDEX IF NOT EXISTS idx_delivery_orders_warehouse_id
    ON public.delivery_orders(warehouse_id);

-- 3. 驗證欄位是否建立成功
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'delivery_orders'
  AND column_name IN ('cargo_items', 'warehouse_id', 'warehouse_name')
ORDER BY column_name;
