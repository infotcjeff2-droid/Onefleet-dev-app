import {
  Warehouse,
  InventoryItem,
  WarehouseStock,
  Truck,
  ReplenishmentOrder,
  StockAlert,
  DispatchOrder,
  DeliveryCargoItem,
  TruckStatus,
  ReplenishmentStatus,
} from '@/types';
import { supabase, hasSupabaseEnv } from './supabase';

/**
 * inventorySync.ts
 *
 * 「庫存與配送」七大共享表與前端 store 之間的同步工具。
 * 設計：
 * - 以 company_id 為多租戶隔離單位（與 user_profile / delivery_orders 一致）
 * - 離線為主、在線為輔：前端 store 可繼續在本地運作，
 *   本檔提供背景推送 (push) 與雲端拉取 (pull) 的 API。
 * - 不破壞既有本地行為：只在 hasSupabaseEnv=true 時嘗試同步，
 *   失敗時靜默記錄 console.warn，不影響使用者操作。
 */

const TABLE_WAREHOUSES = 'inventory_warehouses';
const TABLE_ITEMS = 'inventory_items';
const TABLE_STOCKS = 'inventory_warehouse_stocks';
const TABLE_TRUCKS = 'inventory_trucks';
const TABLE_REPLENISHMENT = 'inventory_replenishment_orders';
const TABLE_ALERTS = 'inventory_stock_alerts';
const TABLE_DISPATCHES = 'inventory_dispatch_orders';

function ensureClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}

/**
 * 從 useAuthStore 中取得目前使用者資訊（延遲載入避免循環依賴）。
 */
function getCurrentUser(): { id: string; role: string; companyId?: string } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useAuthStore } = require('@/store/authStore');
    return useAuthStore.getState().user;
  } catch {
    return null;
  }
}

function getCompanyIdOrThrow(): string {
  const user = getCurrentUser();
  const companyId = user?.companyId;
  if (!companyId) {
    throw new Error('目前用戶沒有 companyId，無法同步庫存資料');
  }
  return companyId;
}

function getUserIdOrThrow(): string {
  const user = getCurrentUser();
  if (!user?.id) {
    throw new Error('目前用戶未登入，無法同步庫存資料');
  }
  return user.id;
}

// ============================================================
// Mapping：App 格式 <-> DB 格式
// ============================================================

interface DbWarehouse {
  id: string;
  user_id: string | null;
  company_id: string | null;
  name: string;
  address: string;
  image_url: string | null;
  total_area: number | null;
  storage_capacity: number | null;
  current_stock_level: number | null;
  manager: string | null;
  phone: string | null;
  notes: string | null;
  internal_lat: number | null;
  internal_lng: number | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

function dbToWarehouse(db: DbWarehouse): Warehouse {
  const internalCoords =
    db.internal_lat != null && db.internal_lng != null
      ? { lat: Number(db.internal_lat), lng: Number(db.internal_lng) }
      : undefined;
  return {
    id: db.id,
    name: db.name,
    address: db.address,
    imageUrl: db.image_url ?? undefined,
    totalArea: db.total_area != null ? Number(db.total_area) : undefined,
    storageCapacity: db.storage_capacity != null ? Number(db.storage_capacity) : undefined,
    currentStockLevel:
      db.current_stock_level != null ? Number(db.current_stock_level) : undefined,
    manager: db.manager ?? undefined,
    phone: db.phone ?? undefined,
    notes: db.notes ?? undefined,
    internalCoords,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    userId: db.user_id ?? undefined,
  };
}

function warehouseToDb(w: Partial<Warehouse>, companyId: string, userId: string): DbWarehouse {
  return {
    id: w.id!,
    user_id: userId,
    company_id: companyId,
    name: w.name ?? '',
    address: w.address ?? '',
    image_url: w.imageUrl ?? null,
    total_area: w.totalArea ?? null,
    storage_capacity: w.storageCapacity ?? null,
    current_stock_level: w.currentStockLevel ?? 0,
    manager: w.manager ?? null,
    phone: w.phone ?? null,
    notes: w.notes ?? null,
    internal_lat: w.internalCoords?.lat ?? null,
    internal_lng: w.internalCoords?.lng ?? null,
    created_at: w.createdAt ?? new Date().toISOString(),
    updated_at: w.updatedAt ?? new Date().toISOString(),
    is_deleted: false,
  };
}

interface DbItem {
  id: string;
  user_id: string | null;
  company_id: string | null;
  name: string;
  sku: string | null;
  category: string | null;
  unit_weight: number | null;
  total_quantity: number | null;
  image_url: string | null;
  default_warehouse_id: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

function dbToItem(db: DbItem): InventoryItem {
  return {
    id: db.id,
    name: db.name,
    unitWeight: db.unit_weight != null ? Number(db.unit_weight) : 0,
    totalQuantity: db.total_quantity != null ? Number(db.total_quantity) : 0,
    imageUrl: db.image_url ?? undefined,
    defaultWarehouseId: db.default_warehouse_id ?? undefined,
    sku: db.sku ?? undefined,
    category: db.category ?? undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    userId: db.user_id ?? undefined,
  };
}

function itemToDb(i: Partial<InventoryItem>, companyId: string, userId: string): DbItem {
  return {
    id: i.id!,
    user_id: userId,
    company_id: companyId,
    name: i.name ?? '',
    sku: i.sku ?? null,
    category: i.category ?? null,
    unit_weight: i.unitWeight ?? 0,
    total_quantity: i.totalQuantity ?? 0,
    image_url: i.imageUrl ?? null,
    default_warehouse_id: i.defaultWarehouseId ?? null,
    created_at: i.createdAt ?? new Date().toISOString(),
    updated_at: i.updatedAt ?? new Date().toISOString(),
    is_deleted: false,
  };
}

interface DbStock {
  id: string;
  user_id: string | null;
  company_id: string | null;
  warehouse_id: string;
  item_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

function dbToStock(db: DbStock): WarehouseStock {
  return {
    id: db.id,
    warehouseId: db.warehouse_id,
    itemId: db.item_id,
    quantity: Number(db.quantity),
    updatedAt: db.updated_at,
    userId: db.user_id ?? undefined,
  };
}

function stockToDb(s: Partial<WarehouseStock>, companyId: string, userId: string): DbStock {
  return {
    id: s.id ?? `stock-${Date.now()}`,
    user_id: userId,
    company_id: companyId,
    warehouse_id: s.warehouseId!,
    item_id: s.itemId!,
    quantity: s.quantity ?? 0,
    created_at: new Date().toISOString(),
    updated_at: s.updatedAt ?? new Date().toISOString(),
    is_deleted: false,
  };
}

interface DbTruck {
  id: string;
  user_id: string | null;
  company_id: string | null;
  plate_number: string;
  max_weight_capacity: number;
  current_load: number;
  status: string;
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

function dbToTruck(db: DbTruck): Truck {
  return {
    id: db.id,
    plateNumber: db.plate_number,
    maxWeightCapacity: Number(db.max_weight_capacity),
    currentLoad: Number(db.current_load),
    status: db.status as TruckStatus,
    assignedDriverId: db.assigned_driver_id ?? undefined,
    assignedDriverName: db.assigned_driver_name ?? undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    userId: db.user_id ?? undefined,
  };
}

function truckToDb(t: Partial<Truck>, companyId: string, userId: string): DbTruck {
  return {
    id: t.id!,
    user_id: userId,
    company_id: companyId,
    plate_number: t.plateNumber ?? '',
    max_weight_capacity: t.maxWeightCapacity ?? 0,
    current_load: t.currentLoad ?? 0,
    status: t.status ?? 'available',
    assigned_driver_id: t.assignedDriverId ?? null,
    assigned_driver_name: t.assignedDriverName ?? null,
    created_at: t.createdAt ?? new Date().toISOString(),
    updated_at: t.updatedAt ?? new Date().toISOString(),
    is_deleted: false,
  };
}

interface DbReplenishment {
  id: string;
  user_id: string | null;
  company_id: string | null;
  item_id: string;
  item_name: string;
  warehouse_id: string;
  warehouse_name: string;
  deficit_quantity: number;
  status: string;
  supplier_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

function dbToReplenishment(db: DbReplenishment): ReplenishmentOrder {
  return {
    id: db.id,
    itemId: db.item_id,
    itemName: db.item_name,
    warehouseId: db.warehouse_id,
    warehouseName: db.warehouse_name,
    deficitQuantity: Number(db.deficit_quantity),
    status: db.status as ReplenishmentStatus,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    userId: db.user_id ?? undefined,
  };
}

function replenishmentToDb(
  r: Partial<ReplenishmentOrder>,
  companyId: string,
  userId: string,
): DbReplenishment {
  return {
    id: r.id!,
    user_id: userId,
    company_id: companyId,
    item_id: r.itemId!,
    item_name: r.itemName ?? '',
    warehouse_id: r.warehouseId!,
    warehouse_name: r.warehouseName ?? '',
    deficit_quantity: r.deficitQuantity ?? 0,
    status: r.status ?? 'pending',
    supplier_id: null,
    notes: null,
    created_at: r.createdAt ?? new Date().toISOString(),
    updated_at: r.updatedAt ?? new Date().toISOString(),
    is_deleted: false,
  };
}

interface DbAlert {
  id: string;
  user_id: string | null;
  company_id: string | null;
  item_id: string;
  item_name: string;
  warehouse_id: string;
  warehouse_name: string;
  requested_quantity: number;
  available_quantity: number;
  deficit_quantity: number;
  delivery_id: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

function dbToAlert(db: DbAlert): StockAlert {
  return {
    id: db.id,
    itemId: db.item_id,
    itemName: db.item_name,
    warehouseId: db.warehouse_id,
    warehouseName: db.warehouse_name,
    requestedQuantity: Number(db.requested_quantity),
    availableQuantity: Number(db.available_quantity),
    deficitQuantity: Number(db.deficit_quantity),
    deliveryId: db.delivery_id ?? '',
    isResolved: db.is_resolved,
    createdAt: db.created_at,
    userId: db.user_id ?? undefined,
  };
}

function alertToDb(a: Partial<StockAlert>, companyId: string, userId: string): DbAlert {
  return {
    id: a.id!,
    user_id: userId,
    company_id: companyId,
    item_id: a.itemId!,
    item_name: a.itemName ?? '',
    warehouse_id: a.warehouseId!,
    warehouse_name: a.warehouseName ?? '',
    requested_quantity: a.requestedQuantity ?? 0,
    available_quantity: a.availableQuantity ?? 0,
    deficit_quantity: a.deficitQuantity ?? 0,
    delivery_id: a.deliveryId ?? null,
    is_resolved: a.isResolved ?? false,
    resolved_at: a.isResolved ? new Date().toISOString() : null,
    created_at: a.createdAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_deleted: false,
  };
}

interface DbDispatch {
  id: string;
  user_id: string | null;
  company_id: string | null;
  delivery_id: string;
  truck_id: string;
  driver_id: string | null;
  driver_name: string | null;
  warehouse_id: string | null;
  assigned_items: unknown;
  total_weight: number;
  route_sequence: string[] | null;
  estimated_distance: number;
  estimated_duration: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

function dbToDispatch(db: DbDispatch): DispatchOrder {
  const assignedRaw = (db.assigned_items as unknown) ?? [];
  const assignedItems: DeliveryCargoItem[] = Array.isArray(assignedRaw)
    ? (assignedRaw as DeliveryCargoItem[])
    : [];
  return {
    id: db.id,
    deliveryId: db.delivery_id,
    truckId: db.truck_id,
    driverId: db.driver_id ?? '',
    driverName: db.driver_name ?? '',
    warehouseId: db.warehouse_id ?? '',
    assignedItems,
    totalWeight: Number(db.total_weight),
    routeSequence: db.route_sequence ?? [],
    estimatedDistance: Number(db.estimated_distance),
    estimatedDuration: Number(db.estimated_duration),
    status: db.status as DispatchOrder['status'],
    createdAt: db.created_at,
  };
}

function dispatchToDb(
  d: Partial<DispatchOrder>,
  companyId: string,
  userId: string,
): DbDispatch {
  return {
    id: d.id!,
    user_id: userId,
    company_id: companyId,
    delivery_id: d.deliveryId ?? '',
    truck_id: d.truckId!,
    driver_id: d.driverId ?? null,
    driver_name: d.driverName ?? null,
    warehouse_id: d.warehouseId ?? null,
    assigned_items: d.assignedItems ?? [],
    total_weight: d.totalWeight ?? 0,
    route_sequence: d.routeSequence ?? [],
    estimated_distance: d.estimatedDistance ?? 0,
    estimated_duration: d.estimatedDuration ?? 0,
    status: d.status ?? 'pending',
    notes: null,
    created_at: d.createdAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_deleted: false,
  };
}

// ============================================================
// Pull：從 Supabase 拉取（讓新裝置 / 新帳號登入時看到雲端庫存）
// ============================================================

export interface InventorySnapshot {
  warehouses: Warehouse[];
  items: InventoryItem[];
  stocks: WarehouseStock[];
  trucks: Truck[];
  replenishment: ReplenishmentOrder[];
  alerts: StockAlert[];
  dispatches: DispatchOrder[];
}

/**
 * 從 Supabase 拉取目前 company 全部庫存資料。
 * - admin 角色：撈所有資料
 * - company / driver：只撈自己的 company_id（或自己指派的）
 */
export async function pullInventoryFromSupabase(): Promise<InventorySnapshot> {
  if (!hasSupabaseEnv) {
    return {
      warehouses: [],
      items: [],
      stocks: [],
      trucks: [],
      replenishment: [],
      alerts: [],
      dispatches: [],
    };
  }

  const client = ensureClient();
  const user = getCurrentUser();
  const companyId = user?.companyId;

  // 沒登入就回空（不是 admin）
  const baseFilters = companyId ? { column: 'company_id', value: companyId } : null;

  try {
    const whQ = client.from(TABLE_WAREHOUSES).select('*').eq('is_deleted', false);
    const itQ = client.from(TABLE_ITEMS).select('*').eq('is_deleted', false);
    const stQ = client.from(TABLE_STOCKS).select('*').eq('is_deleted', false);
    const trQ = client.from(TABLE_TRUCKS).select('*').eq('is_deleted', false);
    const reQ = client.from(TABLE_REPLENISHMENT).select('*').eq('is_deleted', false);
    const alQ = client.from(TABLE_ALERTS).select('*').eq('is_deleted', false);
    const dpQ = client.from(TABLE_DISPATCHES).select('*').eq('is_deleted', false);

    const [wh, it, st, tr, re, al, dp] = await Promise.all([
      baseFilters ? whQ.eq(baseFilters.column, baseFilters.value) : whQ,
      baseFilters ? itQ.eq(baseFilters.column, baseFilters.value) : itQ,
      baseFilters ? stQ.eq(baseFilters.column, baseFilters.value) : stQ,
      baseFilters ? trQ.eq(baseFilters.column, baseFilters.value) : trQ,
      baseFilters ? reQ.eq(baseFilters.column, baseFilters.value) : reQ,
      baseFilters ? alQ.eq(baseFilters.column, baseFilters.value) : alQ,
      baseFilters ? dpQ.eq(baseFilters.column, baseFilters.value) : dpQ,
    ]);

    const warehouses = (wh.data || []).map((r) => dbToWarehouse(r as DbWarehouse));
    const items = (it.data || []).map((r) => dbToItem(r as DbItem));
    const stocks = (st.data || []).map((r) => dbToStock(r as DbStock));
    const trucks = (tr.data || []).map((r) => dbToTruck(r as DbTruck));
    const replenishment = (re.data || []).map((r) => dbToReplenishment(r as DbReplenishment));
    const alerts = (al.data || []).map((r) => dbToAlert(r as DbAlert));
    const dispatches = (dp.data || []).map((r) => dbToDispatch(r as DbDispatch));

    console.log(
      `[inventorySync] pulled ${warehouses.length} warehouses, ${items.length} items, ${stocks.length} stocks, ${trucks.length} trucks, ${replenishment.length} replenishment, ${alerts.length} alerts, ${dispatches.length} dispatches`,
    );

    return { warehouses, items, stocks, trucks, replenishment, alerts, dispatches };
  } catch (err) {
    console.error('[inventorySync] pull failed:', err);
    return {
      warehouses: [],
      items: [],
      stocks: [],
      trucks: [],
      replenishment: [],
      alerts: [],
      dispatches: [],
    };
  }
}

// ============================================================
// Push：背景推送單筆（不拋錯，靜默記錄）
// ============================================================

async function silentUpsert(table: string, rows: unknown[]): Promise<void> {
  if (!hasSupabaseEnv || rows.length === 0) return;
  try {
    const client = ensureClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await client.from(table).upsert(rows as any);
    if (error) {
      console.warn(`[inventorySync] push ${table} error:`, error);
    }
  } catch (err) {
    console.warn(`[inventorySync] push ${table} exception:`, err);
  }
}

export async function pushWarehouse(warehouse: Warehouse): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const userId = getUserIdOrThrow();
    const companyId = getCompanyIdOrThrow();
    await silentUpsert(TABLE_WAREHOUSES, [warehouseToDb(warehouse, companyId, userId)]);
  } catch (err) {
    console.warn('[inventorySync] pushWarehouse:', err);
  }
}

export async function pushItem(item: InventoryItem): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const userId = getUserIdOrThrow();
    const companyId = getCompanyIdOrThrow();
    await silentUpsert(TABLE_ITEMS, [itemToDb(item, companyId, userId)]);
  } catch (err) {
    console.warn('[inventorySync] pushItem:', err);
  }
}

export async function pushStock(stock: WarehouseStock): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const userId = getUserIdOrThrow();
    const companyId = getCompanyIdOrThrow();
    await silentUpsert(TABLE_STOCKS, [stockToDb(stock, companyId, userId)]);
  } catch (err) {
    console.warn('[inventorySync] pushStock:', err);
  }
}

export async function pushTruck(truck: Truck): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const userId = getUserIdOrThrow();
    const companyId = getCompanyIdOrThrow();
    await silentUpsert(TABLE_TRUCKS, [truckToDb(truck, companyId, userId)]);
  } catch (err) {
    console.warn('[inventorySync] pushTruck:', err);
  }
}

export async function pushReplenishment(order: ReplenishmentOrder): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const userId = getUserIdOrThrow();
    const companyId = getCompanyIdOrThrow();
    await silentUpsert(
      TABLE_REPLENISHMENT,
      [replenishmentToDb(order, companyId, userId)],
    );
  } catch (err) {
    console.warn('[inventorySync] pushReplenishment:', err);
  }
}

export async function pushAlert(alert: StockAlert): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const userId = getUserIdOrThrow();
    const companyId = getCompanyIdOrThrow();
    await silentUpsert(TABLE_ALERTS, [alertToDb(alert, companyId, userId)]);
  } catch (err) {
    console.warn('[inventorySync] pushAlert:', err);
  }
}

export async function pushDispatch(dispatch: DispatchOrder): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const userId = getUserIdOrThrow();
    const companyId = getCompanyIdOrThrow();
    await silentUpsert(TABLE_DISPATCHES, [dispatchToDb(dispatch, companyId, userId)]);
  } catch (err) {
    console.warn('[inventorySync] pushDispatch:', err);
  }
}

// 批次推送（用於大量寫入如初始上傳）
export async function pushWarehouseBatch(warehouses: Warehouse[]): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const userId = getUserIdOrThrow();
    const companyId = getCompanyIdOrThrow();
    const rows = warehouses.map((w) => warehouseToDb(w, companyId, userId));
    await silentUpsert(TABLE_WAREHOUSES, rows);
  } catch (err) {
    console.warn('[inventorySync] pushWarehouseBatch:', err);
  }
}

export async function pushItemBatch(items: InventoryItem[]): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const userId = getUserIdOrThrow();
    const companyId = getCompanyIdOrThrow();
    const rows = items.map((i) => itemToDb(i, companyId, userId));
    await silentUpsert(TABLE_ITEMS, rows);
  } catch (err) {
    console.warn('[inventorySync] pushItemBatch:', err);
  }
}

export async function pushStockBatch(stocks: WarehouseStock[]): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const userId = getUserIdOrThrow();
    const companyId = getCompanyIdOrThrow();
    const rows = stocks.map((s) => stockToDb(s, companyId, userId));
    await silentUpsert(TABLE_STOCKS, rows);
  } catch (err) {
    console.warn('[inventorySync] pushStockBatch:', err);
  }
}

export async function pushTruckBatch(trucks: Truck[]): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const userId = getUserIdOrThrow();
    const companyId = getCompanyIdOrThrow();
    const rows = trucks.map((t) => truckToDb(t, companyId, userId));
    await silentUpsert(TABLE_TRUCKS, rows);
  } catch (err) {
    console.warn('[inventorySync] pushTruckBatch:', err);
  }
}

// ============================================================
// Delete：軟刪除（沿用 is_deleted 旗標）
// ============================================================

export async function softDeleteWarehouse(id: string): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const client = ensureClient();
    const { error } = await client
      .from(TABLE_WAREHOUSES)
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) console.warn('[inventorySync] softDeleteWarehouse:', error);
  } catch (err) {
    console.warn('[inventorySync] softDeleteWarehouse:', err);
  }
}

export async function softDeleteItem(id: string): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const client = ensureClient();
    const userId = getUserIdOrThrow();
    const companyId = getCompanyIdOrThrow();
    // 同時把相依的 stocks / alerts / replenishment / dispatch 項目也清掉
    await Promise.all([
      client
        .from(TABLE_ITEMS)
        .update({ is_deleted: true })
        .eq('id', id)
        .eq('company_id', companyId),
      client
        .from(TABLE_STOCKS)
        .update({ is_deleted: true })
        .eq('item_id', id)
        .eq('company_id', companyId),
      client
        .from(TABLE_ALERTS)
        .update({ is_deleted: true })
        .eq('item_id', id)
        .eq('company_id', companyId),
      client
        .from(TABLE_REPLENISHMENT)
        .update({ is_deleted: true })
        .eq('item_id', id)
        .eq('company_id', companyId),
    ]);
    void userId;
  } catch (err) {
    console.warn('[inventorySync] softDeleteItem:', err);
  }
}

export async function softDeleteTruck(id: string): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const client = ensureClient();
    const { error } = await client
      .from(TABLE_TRUCKS)
      .update({ is_deleted: true })
      .eq('id', id);
    if (error) console.warn('[inventorySync] softDeleteTruck:', error);
  } catch (err) {
    console.warn('[inventorySync] softDeleteTruck:', err);
  }
}

export async function softDeleteReplenishment(id: string): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const client = ensureClient();
    const { error } = await client
      .from(TABLE_REPLENISHMENT)
      .update({ is_deleted: true })
      .eq('id', id);
    if (error) console.warn('[inventorySync] softDeleteReplenishment:', error);
  } catch (err) {
    console.warn('[inventorySync] softDeleteReplenishment:', err);
  }
}

export async function softDeleteAlert(id: string): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const client = ensureClient();
    const { error } = await client
      .from(TABLE_ALERTS)
      .update({ is_deleted: true })
      .eq('id', id);
    if (error) console.warn('[inventorySync] softDeleteAlert:', error);
  } catch (err) {
    console.warn('[inventorySync] softDeleteAlert:', err);
  }
}

export async function softDeleteDispatch(id: string): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const client = ensureClient();
    const { error } = await client
      .from(TABLE_DISPATCHES)
      .update({ is_deleted: true })
      .eq('id', id);
    if (error) console.warn('[inventorySync] softDeleteDispatch:', error);
  } catch (err) {
    console.warn('[inventorySync] softDeleteDispatch:', err);
  }
}

// 便利旗標：是否能在背景跑同步
export const inventorySyncEnabled = hasSupabaseEnv;
