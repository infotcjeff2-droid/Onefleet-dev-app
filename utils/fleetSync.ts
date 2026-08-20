import { Vehicle, User, DeliveryOrder, DeliveryStatus, SignatureStroke, DeliveryPhoto, DeliveryCargoItem } from '@/types';
import { supabase, hasSupabaseEnv as hasSupabaseEnvConfigured } from './supabase';

const VEHICLES_TABLE = 'vehicles';
const TABLE_NAME = 'fleet_sync';

// Use the hasSupabaseEnv from supabase.ts
export const hasSupabaseEnv = hasSupabaseEnvConfigured;

export interface FleetSyncSnapshot {
  vehicles: Vehicle[];
  deliveries: DeliveryOrder[];
  users: User[];
}

interface SyncEnvelope {
  user_id: string;
  fleet_id?: string;
  vehicles: Vehicle[];
  deliveries: DeliveryOrder[];
  users: User[];
  updated_at?: string;
}

function ensureClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}

/** 取得目前登入使用者的 Clerk userId（對應 Supabase auth.uid()） */
function getCurrentUserId(): string {
  // 延遲載入避免循環依賴
  const { useAuthStore } = require('@/store/authStore');
  return useAuthStore.getState().user?.id ?? '';
}

function normalizeSnapshot(snapshot?: Partial<FleetSyncSnapshot> | null): FleetSyncSnapshot {
  return {
    vehicles: Array.isArray(snapshot?.vehicles) ? snapshot.vehicles : [],
    deliveries: Array.isArray(snapshot?.deliveries) ? snapshot.deliveries : [],
    users: Array.isArray(snapshot?.users) ? snapshot.users : [],
  };
}

// ============================================================
// 共享車輛表操作（所有用戶共享）
// ============================================================

/**
 * 從共享 vehicles 表獲取所有車輛
 */
export async function fetchVehiclesFromSupabase(): Promise<Vehicle[]> {
  try {
    const client = ensureClient();

    const { data, error } = await client
      .from(VEHICLES_TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[fleetSync] fetchVehicles error:', error);
      // 不要拋出錯誤，返回空陣列讓 UI 繼續顯示
      return [];
    }

    return (data || []).map(mapDbToVehicle);
  } catch (err) {
    console.error('[fleetSync] fetchVehicles exception:', err);
    return [];
  }
}

/**
 * 將車輛陣列同步到共享 vehicles 表（先刪除舊數據再插入新數據）
 */
export async function syncVehiclesToSupabase(vehicles: Vehicle[]): Promise<void> {
  const client = ensureClient();

  // 先刪除所有現有車輛
  const { error: deleteError } = await client.from(VEHICLES_TABLE).delete().neq('id', '');
  if (deleteError) {
    console.error('[fleetSync] delete vehicles error:', deleteError);
    throw deleteError;
  }

  // 插入新數據
  if (vehicles.length > 0) {
    const dbVehicles = vehicles.map(mapVehicleToDb);
    const { error: insertError } = await client.from(VEHICLES_TABLE).insert(dbVehicles);
    if (insertError) {
      console.error('[fleetSync] insert vehicles error:', insertError);
      throw insertError;
    }
  }

  console.log(`[fleetSync] 同步了 ${vehicles.length} 輛車到 Supabase`);
}

/**
 * 添加單一車輛到共享表
 */
export async function addVehicleToSupabase(vehicle: Vehicle): Promise<Vehicle> {
  const client = ensureClient();

  const dbVehicle = mapVehicleToDb(vehicle);
  const { data, error } = await client
    .from(VEHICLES_TABLE)
    .insert(dbVehicle)
    .select()
    .single();

  if (error) {
    console.error('[fleetSync] addVehicle error:', error);
    throw error;
  }

  return mapDbToVehicle(data);
}

/**
 * 更新共享表中的車輛
 */
export async function updateVehicleInSupabase(id: string, updates: Partial<Vehicle>): Promise<Vehicle> {
  const client = ensureClient();

  // 將前端欄位名稱映射為 DB 欄位名稱（devIdno → gps_device_id）
  const dbUpdates: Record<string, unknown> = {};
  if ('make' in updates) dbUpdates.make = updates.make || 'Unknown';
  if ('model' in updates) dbUpdates.model = updates.model || 'Unknown';
  if ('plateNumber' in updates) dbUpdates.plate_number = updates.plateNumber || '';
  if ('color' in updates) dbUpdates.color = updates.color || '';
  if ('year' in updates) dbUpdates.year = updates.year || new Date().getFullYear();
  if ('vin' in updates) dbUpdates.vin = updates.vin || '';
  if ('status' in updates) dbUpdates.status = updates.status || 'inactive';
  if ('gpsDeviceId' in updates || 'devIdno' in updates) {
    dbUpdates.gps_device_id = updates.gpsDeviceId || (updates as any).devIdno || null;
  }
  if ('imageUrl' in updates) dbUpdates.image_url = updates.imageUrl || null;
  if ('fuelType' in updates) dbUpdates.fuel_type = updates.fuelType || 'gasoline';
  if ('transmission' in updates) dbUpdates.transmission = updates.transmission || 'automatic';
  if ('mileage' in updates) dbUpdates.mileage = updates.mileage ?? 0;
  if ('bodyType' in updates) dbUpdates.body_type = updates.bodyType || 'sedan';
  if ('purchaseDate' in updates) dbUpdates.purchase_date = updates.purchaseDate || '';
  if ('insuranceExpiry' in updates) dbUpdates.insurance_expiry = updates.insuranceExpiry || '';
  if ('registrationExpiry' in updates) dbUpdates.registration_expiry = updates.registrationExpiry || '';
  if ('notes' in updates) dbUpdates.notes = updates.notes || '';
  if ('assignedDriverId' in updates) dbUpdates.assigned_driver_id = updates.assignedDriverId || null;
  if ('ownerId' in updates) dbUpdates.owner_id = updates.ownerId || null;
  dbUpdates.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from(VEHICLES_TABLE)
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[fleetSync] updateVehicle error:', error);
    throw error;
  }

  return mapDbToVehicle(data);
}

/**
 * 從共享表刪除車輛
 */
export async function deleteVehicleFromSupabase(id: string): Promise<void> {
  const client = ensureClient();

  const { error } = await client
    .from(VEHICLES_TABLE)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[fleetSync] deleteVehicle error:', error);
    throw error;
  }
}

/**
 * 批量從本地存儲遷移到 Supabase
 */
export async function migrateLocalVehiclesToSupabase(localVehicles: Vehicle[]): Promise<void> {
  if (localVehicles.length === 0) {
    console.log('[fleetSync] 沒有本地車輛需要遷移');
    return;
  }

  await syncVehiclesToSupabase(localVehicles);
  console.log(`[fleetSync] 遷移完成: ${localVehicles.length} 輛車`);
}

// 轉換函數：Database 格式 <-> App 格式
function mapDbToVehicle(db: Record<string, unknown>): Vehicle {
  return {
    id: db.id as string,
    make: (db.make as string) || 'Unknown',
    model: (db.model as string) || 'Unknown',
    plateNumber: (db.plate_number as string) || '',
    color: (db.color as string) || '',
    year: (db.year as number) || new Date().getFullYear(),
    vin: (db.vin as string) || '',
    status: (db.status as Vehicle['status']) || 'inactive',
    devIdno: db.gps_device_id as string | undefined,
    imageUrl: (db.image_url as string) || '',
    createdAt: (db.created_at as string) || new Date().toISOString(),
    // 以下為擴充欄位（需 vehicles-extend-columns.sql migration 後才能正確讀取）
    fuelType: (db.fuel_type as Vehicle['fuelType']) || 'gasoline',
    transmission: (db.transmission as Vehicle['transmission']) || 'automatic',
    mileage: (db.mileage as number) || 0,
    bodyType: (db.body_type as Vehicle['bodyType']) || 'sedan',
    purchaseDate: (db.purchase_date as string) || '',
    insuranceExpiry: (db.insurance_expiry as string) || '',
    registrationExpiry: (db.registration_expiry as string) || '',
    notes: (db.notes as string) || '',
    assignedDriverId: (db.assigned_driver_id as string) || undefined,
    ownerId: (db.owner_id as string) || undefined,
  };
}

function mapVehicleToDb(vehicle: Partial<Vehicle>): Record<string, unknown> {
  return {
    id: vehicle.id,
    make: vehicle.make || 'Unknown',
    model: vehicle.model || 'Unknown',
    plate_number: vehicle.plateNumber || '',
    color: vehicle.color || '',
    year: vehicle.year || new Date().getFullYear(),
    vin: vehicle.vin || '',
    status: vehicle.status || 'inactive',
    gps_device_id: vehicle.gpsDeviceId || vehicle.devIdno || null,
    image_url: vehicle.imageUrl || null,
    // 以下為擴充欄位（需 vehicles-extend-columns.sql migration 新增欄位後才能正確寫入）
    fuel_type: vehicle.fuelType || 'gasoline',
    transmission: vehicle.transmission || 'automatic',
    mileage: vehicle.mileage ?? 0,
    body_type: vehicle.bodyType || 'sedan',
    purchase_date: vehicle.purchaseDate || '',
    insurance_expiry: vehicle.insuranceExpiry || '',
    registration_expiry: vehicle.registrationExpiry || '',
    notes: vehicle.notes || '',
    assigned_driver_id: vehicle.assignedDriverId || null,
    owner_id: vehicle.ownerId || null,
    created_at: vehicle.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ============================================================
// 舊的 fleet_sync 表操作（保留以兼容其他功能）
// ============================================================

/**
 * 從 Supabase 擷取目前使用者的資料快照。
 * RLS 政策由 user_id = auth.uid() 自動過濾，確保每位用戶只能讀取自己的資料。
 */
export async function fetchFleetSnapshot(): Promise<FleetSyncSnapshot | null> {
  const client = ensureClient();
  const userId = getCurrentUserId();

  if (!userId) {
    return null;
  }

  const { data, error } = await client
    .from(TABLE_NAME)
    .select('user_id, vehicles, deliveries, users, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return normalizeSnapshot({
    vehicles: data.vehicles as Vehicle[],
    deliveries: data.deliveries as DeliveryOrder[],
    users: data.users as User[],
  });
}

/**
 * 將目前使用者的資料快照寫入 Supabase（upsert by user_id）。
 * 所有資料以 userId 為 key 隔離，不會覆寫其他使用者的資料。
 */
export async function pushFleetSnapshot(snapshot: Partial<FleetSyncSnapshot>) {
  const client = ensureClient();
  const userId = getCurrentUserId();

  if (!userId) {
    throw new Error('User not authenticated, cannot sync fleet data.');
  }

  const currentRemote = await fetchFleetSnapshot().catch(() => null);
  const merged = normalizeSnapshot({
    vehicles: snapshot.vehicles ?? currentRemote?.vehicles,
    deliveries: snapshot.deliveries ?? currentRemote?.deliveries,
    users: snapshot.users ?? currentRemote?.users,
  });

  const payload: SyncEnvelope = {
    user_id: userId,
    vehicles: merged.vehicles,
    deliveries: merged.deliveries,
    users: merged.users,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from(TABLE_NAME)
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    throw error;
  }

  return merged;
}

// ============================================================
// delivery_orders 表操作（共享配送單表）
// ============================================================

const DELIVERY_ORDERS_TABLE = 'delivery_orders';

interface DbDeliveryOrder {
  id: string;
  order_no: string;
  user_id: string;
  company_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  pickup_address: string;
  pickup_contact: string | null;
  pickup_time: string;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_address: string;
  dropoff_contact: string | null;
  dropoff_phone: string | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  status: string;
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
  assigned_at: string | null;
  signature_data: string | null;
  signed_at: string | null;
  signature_strokes: SignatureStroke[][] | null;
  photos: DeliveryPhoto[] | null;
  pickup_photos: DeliveryPhoto[] | null;
  picked_up_at: string | null;
  in_transit_at: string | null;
  delivered_at: string | null;
  delivery_fee: number;
  cod_amount: number;
  notes: string | null;
  cargo_description: string;
  cargo_weight: number;
  cargo_items: DeliveryCargoItem[] | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  is_completed: boolean;
}

/**
 * 將 DeliveryOrder 轉換為 DB 格式
 */
function mapDeliveryOrderToDb(order: Partial<DeliveryOrder>): DbDeliveryOrder {
  return {
    id: order.id!,
    order_no: order.orderNo || '',
    user_id: order.userId || '',
    company_id: order.companyId || null,
    customer_name: order.customerName || '',
    customer_phone: order.customerPhone || null,
    pickup_address: order.pickupAddress || '',
    pickup_contact: order.pickupContact || null,
    pickup_time: order.pickupTime || new Date().toISOString(),
    pickup_latitude: order.pickupLatitude ?? null,
    pickup_longitude: order.pickupLongitude ?? null,
    dropoff_address: order.dropoffAddress || '',
    dropoff_contact: order.dropoffContact || null,
    dropoff_phone: order.dropoffPhone || null,
    dropoff_latitude: order.dropoffLatitude ?? null,
    dropoff_longitude: order.dropoffLongitude ?? null,
    status: order.status || 'pending',
    assigned_driver_id: order.assignedDriverId || null,
    assigned_driver_name: order.assignedDriverName || null,
    assigned_at: order.assignedAt || null,
    signature_data: order.signatureData || null,
    signed_at: order.signedAt || null,
    signature_strokes: order.signatureStrokes || null,
    photos: order.photos || null,
    pickup_photos: order.pickupPhotos || null,
    picked_up_at: order.pickedUpAt || null,
    in_transit_at: order.inTransitAt || null,
    delivered_at: order.deliveredAt || null,
    delivery_fee: order.deliveryFee ?? 0,
    cod_amount: order.codAmount ?? 0,
    notes: order.notes || null,
    cargo_description: order.cargoDescription || '',
    cargo_weight: order.cargoWeight ?? 0,
    cargo_items: order.cargoItems ?? null,
    warehouse_id: order.warehouseId ?? null,
    warehouse_name: order.warehouseName ?? null,
    created_at: order.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_deleted: false,
    is_completed: order.isCompleted ?? false,
  };
}

/**
 * 將 DB 格式轉換為 App 的 DeliveryOrder 格式
 */
function mapDbToDeliveryOrder(db: DbDeliveryOrder): DeliveryOrder {
  return {
    id: db.id,
    orderNo: db.order_no,
    userId: db.user_id,
    companyId: db.company_id || undefined,
    customerName: db.customer_name,
    customerPhone: db.customer_phone || '',
    pickupAddress: db.pickup_address,
    pickupContact: db.pickup_contact || undefined,
    pickupLatitude: db.pickup_latitude ?? undefined,
    pickupLongitude: db.pickup_longitude ?? undefined,
    pickupTime: db.pickup_time,
    dropoffAddress: db.dropoff_address,
    dropoffContact: db.dropoff_contact || undefined,
    dropoffPhone: db.dropoff_phone || undefined,
    dropoffLatitude: db.dropoff_latitude ?? undefined,
    dropoffLongitude: db.dropoff_longitude ?? undefined,
    status: db.status as DeliveryStatus,
    assignedDriverId: db.assigned_driver_id || undefined,
    assignedDriverName: db.assigned_driver_name || undefined,
    assignedAt: db.assigned_at || undefined,
    signatureData: db.signature_data || undefined,
    signedAt: db.signed_at || undefined,
    signatureStrokes: db.signature_strokes || undefined,
    photos: db.photos || undefined,
    pickupPhotos: db.pickup_photos || undefined,
    pickedUpAt: db.picked_up_at || undefined,
    inTransitAt: db.in_transit_at || undefined,
    deliveredAt: db.delivered_at || undefined,
    deliveryFee: db.delivery_fee,
    codAmount: db.cod_amount,
    notes: db.notes || undefined,
    cargoDescription: db.cargo_description,
    cargoWeight: db.cargo_weight,
    cargoItems: db.cargo_items ?? undefined,
    warehouseId: db.warehouse_id ?? undefined,
    warehouseName: db.warehouse_name ?? undefined,
    createdAt: db.created_at,
    isCompleted: db.is_completed || undefined,
  };
}

/**
 * 從 delivery_orders 表獲取所有配送單
 */
export async function fetchDeliveryOrders(): Promise<DeliveryOrder[]> {
  try {
    const client = ensureClient();

    const { data, error } = await client
      .from(DELIVERY_ORDERS_TABLE)
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[fleetSync] fetchDeliveryOrders error:', error);
      return [];
    }

    return (data || []).map(mapDbToDeliveryOrder);
  } catch (err) {
    console.error('[fleetSync] fetchDeliveryOrders exception:', err);
    return [];
  }
}

/**
 * 根據 ID 獲取單一配送單
 */
export async function fetchDeliveryOrderById(id: string): Promise<DeliveryOrder | null> {
  try {
    const client = ensureClient();

    const { data, error } = await client
      .from(DELIVERY_ORDERS_TABLE)
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .maybeSingle();

    if (error) {
      console.error('[fleetSync] fetchDeliveryOrderById error:', error);
      return null;
    }

    return data ? mapDbToDeliveryOrder(data) : null;
  } catch (err) {
    console.error('[fleetSync] fetchDeliveryOrderById exception:', err);
    return null;
  }
}

/**
 * 新增配送單到 delivery_orders 表
 */
export async function createDeliveryOrder(order: Partial<DeliveryOrder>): Promise<DeliveryOrder> {
  const client = ensureClient();

  const dbOrder = mapDeliveryOrderToDb(order);

  const { data, error } = await client
    .from(DELIVERY_ORDERS_TABLE)
    .insert(dbOrder)
    .select()
    .single();

  if (error) {
    console.error('[fleetSync] createDeliveryOrder error:', error);
    throw error;
  }

  console.log(`[fleetSync] 新增配送單 ${data.order_no}`);
  return mapDbToDeliveryOrder(data);
}

/**
 * 更新 delivery_orders 表中的配送單
 */
export async function updateDeliveryOrder(
  id: string,
  updates: Partial<DeliveryOrder>
): Promise<DeliveryOrder> {
  const client = ensureClient();

  const dbUpdates: Record<string, unknown> = {};

  if (updates.orderNo !== undefined) dbUpdates.order_no = updates.orderNo;
  if (updates.customerName !== undefined) dbUpdates.customer_name = updates.customerName;
  if (updates.customerPhone !== undefined) dbUpdates.customer_phone = updates.customerPhone;
  if (updates.pickupAddress !== undefined) dbUpdates.pickup_address = updates.pickupAddress;
  if (updates.pickupContact !== undefined) dbUpdates.pickup_contact = updates.pickupContact;
  if (updates.pickupLatitude !== undefined) dbUpdates.pickup_latitude = updates.pickupLatitude;
  if (updates.pickupLongitude !== undefined) dbUpdates.pickup_longitude = updates.pickupLongitude;
  if (updates.pickupTime !== undefined) dbUpdates.pickup_time = updates.pickupTime;
  if (updates.dropoffAddress !== undefined) dbUpdates.dropoff_address = updates.dropoffAddress;
  if (updates.dropoffContact !== undefined) dbUpdates.dropoff_contact = updates.dropoffContact;
  if (updates.dropoffPhone !== undefined) dbUpdates.dropoff_phone = updates.dropoffPhone;
  if (updates.dropoffLatitude !== undefined) dbUpdates.dropoff_latitude = updates.dropoffLatitude;
  if (updates.dropoffLongitude !== undefined) dbUpdates.dropoff_longitude = updates.dropoffLongitude;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.assignedDriverId !== undefined) dbUpdates.assigned_driver_id = updates.assignedDriverId;
  if (updates.assignedDriverName !== undefined) dbUpdates.assigned_driver_name = updates.assignedDriverName;
  if (updates.assignedAt !== undefined) dbUpdates.assigned_at = updates.assignedAt;
  if (updates.signatureData !== undefined) dbUpdates.signature_data = updates.signatureData;
  if (updates.signedAt !== undefined) dbUpdates.signed_at = updates.signedAt;
  if (updates.signatureStrokes !== undefined) dbUpdates.signature_strokes = updates.signatureStrokes;
  if (updates.photos !== undefined) dbUpdates.photos = updates.photos;
  if (updates.pickupPhotos !== undefined) dbUpdates.pickup_photos = updates.pickupPhotos;
  if (updates.pickedUpAt !== undefined) dbUpdates.picked_up_at = updates.pickedUpAt;
  if (updates.inTransitAt !== undefined) dbUpdates.in_transit_at = updates.inTransitAt;
  if (updates.deliveredAt !== undefined) dbUpdates.delivered_at = updates.deliveredAt;
  if (updates.deliveryFee !== undefined) dbUpdates.delivery_fee = updates.deliveryFee;
  if (updates.codAmount !== undefined) dbUpdates.cod_amount = updates.codAmount;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.companyId !== undefined) dbUpdates.company_id = updates.companyId;
  if (updates.cargoDescription !== undefined) dbUpdates.cargo_description = updates.cargoDescription;
  if (updates.cargoWeight !== undefined) dbUpdates.cargo_weight = updates.cargoWeight;
  if (updates.cargoItems !== undefined) dbUpdates.cargo_items = updates.cargoItems;
  if (updates.warehouseId !== undefined) dbUpdates.warehouse_id = updates.warehouseId;
  if (updates.warehouseName !== undefined) dbUpdates.warehouse_name = updates.warehouseName;
  if (updates.isCompleted !== undefined) dbUpdates.is_completed = updates.isCompleted;

  if (Object.keys(dbUpdates).length === 0) {
    const existing = await fetchDeliveryOrderById(id);
    if (!existing) throw new Error('Delivery order not found');
    return existing;
  }

  dbUpdates.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from(DELIVERY_ORDERS_TABLE)
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[fleetSync] updateDeliveryOrder error:', error);
    throw error;
  }

  return mapDbToDeliveryOrder(data);
}

/**
 * 軟刪除 delivery_orders 表中的配送單
 */
export async function deleteDeliveryOrder(id: string): Promise<void> {
  const client = ensureClient();

  const { error } = await client
    .from(DELIVERY_ORDERS_TABLE)
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[fleetSync] deleteDeliveryOrder error:', error);
    throw error;
  }

  console.log(`[fleetSync] 軟刪除配送單 ${id}`);
}

/**
 * 根據司機 ID 獲取指派給該司機的配送單
 */
export async function fetchDeliveryOrdersByDriver(driverId: string): Promise<DeliveryOrder[]> {
  try {
    const client = ensureClient();

    const { data, error } = await client
      .from(DELIVERY_ORDERS_TABLE)
      .select('*')
      .eq('assigned_driver_id', driverId)
      .eq('is_deleted', false)
      .order('pickup_time', { ascending: true });

    if (error) {
      console.error('[fleetSync] fetchDeliveryOrdersByDriver error:', error);
      return [];
    }

    return (data || []).map(mapDbToDeliveryOrder);
  } catch (err) {
    console.error('[fleetSync] fetchDeliveryOrdersByDriver exception:', err);
    return [];
  }
}

/**
 * 根據狀態獲取配送單
 */
export async function fetchDeliveryOrdersByStatus(status: DeliveryStatus): Promise<DeliveryOrder[]> {
  try {
    const client = ensureClient();

    const { data, error } = await client
      .from(DELIVERY_ORDERS_TABLE)
      .select('*')
      .eq('status', status)
      .eq('is_deleted', false)
      .order('pickup_time', { ascending: true });

    if (error) {
      console.error('[fleetSync] fetchDeliveryOrdersByStatus error:', error);
      return [];
    }

    return (data || []).map(mapDbToDeliveryOrder);
  } catch (err) {
    console.error('[fleetSync] fetchDeliveryOrdersByStatus exception:', err);
    return [];
  }
}

/**
 * 根據公司 ID 獲取配送單
 */
export async function fetchDeliveryOrdersByCompany(companyId: string): Promise<DeliveryOrder[]> {
  try {
    const client = ensureClient();

    const { data, error } = await client
      .from(DELIVERY_ORDERS_TABLE)
      .select('*')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[fleetSync] fetchDeliveryOrdersByCompany error:', error);
      return [];
    }

    return (data || []).map(mapDbToDeliveryOrder);
  } catch (err) {
    console.error('[fleetSync] fetchDeliveryOrdersByCompany exception:', err);
    return [];
  }
}

// ============================================================
// user_profile 表操作（共享使用者池）
// ============================================================

const USER_PROFILE_TABLE = 'user_profile';

interface DbUserProfile {
  id: string;
  email: string;
  name: string;
  name_zh: string | null;
  name_en: string | null;
  phone: string | null;
  avatar: string | null;
  address: string | null;
  role: string;
  company_id: string | null;
  password: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  /** 使用者來源：clerk = Clerk OAuth，managed = 網頁新增 */
  source: string | null;
  /** 使用者來源：clerk = Clerk OAuth，managed = 網頁新增 */
  source: string | null;
}

/**
 * 將 ManagedUser 轉換為 DB 格式
 */
function mapUserToDbProfile(user: User & { password?: string }): DbUserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    name_zh: user.nameZh ?? null,
    name_en: user.nameEn ?? null,
    phone: user.phone ?? null,
    avatar: user.avatar ?? null,
    address: user.address ?? null,
    role: user.role,
    company_id: user.companyId ?? null,
    password: user.password ?? null,
    created_at: new Date().toISOString(),
    source: user.source ?? null,
    updated_at: new Date().toISOString(),
    is_deleted: false,
  };
}

/**
 * 將 DB 格式轉換為 App 的 User 格式
 */
function mapDbProfileToUser(db: DbUserProfile): User & { password?: string } {
  return {
    id: db.id,
    email: db.email,
    name: db.name,
    nameZh: db.name_zh ?? undefined,
    nameEn: db.name_en ?? undefined,
    phone: db.phone ?? undefined,
    avatar: db.avatar ?? undefined,
    address: db.address ?? undefined,
    role: db.role as User['role'],
    source: (db.source as User['source']) ?? undefined,
    companyId: db.company_id ?? undefined,
    password: db.password ?? undefined,
  };
}

/**
 * 從 user_profile 表取得所有使用者（含 password 欄位）
 */
export async function fetchUserProfiles(): Promise<(User & { password?: string })[]> {
  try {
    const client = ensureClient();

    const { data, error } = await client
      .from(USER_PROFILE_TABLE)
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[fleetSync] fetchUserProfiles error:', error);
      return [];
    }

    return (data || []).map(mapDbProfileToUser);
  } catch (err) {
    console.error('[fleetSync] fetchUserProfiles exception:', err);
    return [];
  }
}

/**
 * 將使用者同步到 user_profile 表（upsert by id；含 password 欄位）
 */
export async function syncUserProfiles(users: (User & { password?: string })[]): Promise<void> {
  const client = ensureClient();

  if (users.length === 0) {
    return;
  }

  const dbProfiles = users.map(mapUserToDbProfile);

  for (const profile of dbProfiles) {
    const { error } = await client
      .from(USER_PROFILE_TABLE)
      .upsert(profile, { onConflict: 'id' });

    if (error) {
      console.error('[fleetSync] syncUserProfile error:', error, profile.id);
    }
  }

  console.log(`[fleetSync] 同步了 ${users.length} 個使用者到 user_profile 表`);
}

/**
 * 新增單一使用者到 user_profile 表
 */
export async function addUserProfile(user: User & { password?: string }): Promise<void> {
  const client = ensureClient();

  const dbProfile = mapUserToDbProfile(user);

  const { error } = await client
    .from(USER_PROFILE_TABLE)
    .insert(dbProfile);

  if (error) {
    console.error('[fleetSync] addUserProfile error:', error);
    throw error;
  }

  console.log(`[fleetSync] 新增使用者 ${user.id} 到 user_profile 表`);
}

/**
 * 更新 user_profile 表中的使用者
 */
export async function updateUserProfile(id: string, updates: Partial<User> & { password?: string }): Promise<void> {
  const client = ensureClient();

  const dbUpdates: Record<string, unknown> = {};

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.nameZh !== undefined) dbUpdates.name_zh = updates.nameZh;
  if (updates.nameEn !== undefined) dbUpdates.name_en = updates.nameEn;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.avatar !== undefined) dbUpdates.avatar = updates.avatar;
  if (updates.address !== undefined) dbUpdates.address = updates.address;
  if (updates.role !== undefined) dbUpdates.role = updates.role;
  if (updates.companyId !== undefined) dbUpdates.company_id = updates.companyId;
  if (updates.password !== undefined) dbUpdates.password = updates.password;

  if (Object.keys(dbUpdates).length === 0) {
    return;
  }

  const { error } = await client
    .from(USER_PROFILE_TABLE)
    .update(dbUpdates)
    .eq('id', id);

  if (error) {
    console.error('[fleetSync] updateUserProfile error:', error);
    throw error;
  }
}

/**
 * 軟刪除 user_profile 表中的使用者
 */
export async function softDeleteUserProfile(id: string): Promise<void> {
  const client = ensureClient();

  const { error } = await client
    .from(USER_PROFILE_TABLE)
    .update({ is_deleted: true })
    .eq('id', id);

  if (error) {
    console.error('[fleetSync] softDeleteUserProfile error:', error);
    throw error;
  }
}

// ============================================================
// system_settings 表操作
// ============================================================

const SYSTEM_SETTINGS_TABLE = 'system_settings';

export interface SystemSetting {
  id: string;
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardChartConfig {
  show_total_orders: boolean;
  show_avg_duration: boolean;
  show_efficiency_rate: boolean;
  show_active_drivers: boolean;
  chart_series_duration: boolean;
}

const DEFAULT_CHART_CONFIG: DashboardChartConfig = {
  show_total_orders: true,
  show_avg_duration: true,
  show_efficiency_rate: true,
  show_active_drivers: true,
  chart_series_duration: true,
};

/**
 * 獲取系統設定值（根據 key）
 */
export async function getSystemSetting(key: string): Promise<Record<string, unknown> | null> {
  try {
    const client = ensureClient();

    const { data, error } = await client
      .from(SYSTEM_SETTINGS_TABLE)
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.error('[fleetSync] getSystemSetting error:', error);
      return null;
    }

    return data?.value ?? null;
  } catch (err) {
    console.error('[fleetSync] getSystemSetting exception:', err);
    return null;
  }
}

/**
 * 獲取儀表板圖表設定
 */
export async function getDashboardChartConfig(): Promise<DashboardChartConfig> {
  const value = await getSystemSetting('dashboard_chart_config');
  if (!value) return DEFAULT_CHART_CONFIG;
  
  return {
    show_total_orders: value.show_total_orders ?? true,
    show_avg_duration: value.show_avg_duration ?? true,
    show_efficiency_rate: value.show_efficiency_rate ?? true,
    show_active_drivers: value.show_active_drivers ?? true,
    chart_series_duration: value.chart_series_duration ?? true,
  };
}

/**
 * 更新系統設定值（根據 key）
 */
export async function updateSystemSetting(key: string, value: Record<string, unknown>): Promise<boolean> {
  try {
    const client = ensureClient();

    const { error } = await client
      .from(SYSTEM_SETTINGS_TABLE)
      .upsert(
        {
          key,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (error) {
      console.error('[fleetSync] updateSystemSetting error:', error);
      return false;
    }

    console.log(`[fleetSync] Updated system setting: ${key}`);
    return true;
  } catch (err) {
    console.error('[fleetSync] updateSystemSetting exception:', err);
    return false;
  }
}

/**
 * 更新儀表板圖表設定
 */
export async function updateDashboardChartConfig(config: Partial<DashboardChartConfig>): Promise<boolean> {
  const currentConfig = await getDashboardChartConfig();
  const mergedConfig = { ...currentConfig, ...config };
  return updateSystemSetting('dashboard_chart_config', mergedConfig);
}

/**
 * 從 user_profile 表硬刪除使用者
 */
export async function hardDeleteUserProfile(id: string): Promise<void> {
  const client = ensureClient();

  const { error } = await client
    .from(USER_PROFILE_TABLE)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[fleetSync] hardDeleteUserProfile error:', error);
    throw error;
  }
}

/**
 * 用 email 硬刪除所有 user_profile row（同 email 可能有多筆殭屍 row）。
 * 垃圾桶「永久刪除」時呼叫，避免 cloud 殭屍 row 復活。
 * 同時設 is_deleted=true 作為雙保險。
 */
export async function hardDeleteUserProfileByEmail(email: string): Promise<{
  deleted: number;
  softMarked: number;
}> {
  const client = ensureClient();
  const result = { deleted: 0, softMarked: 0 };

  if (!email) {
    return result;
  }

  // 1) DELETE by email — 清掉所有 is_deleted=false 的殭屍 row
  try {
    const { data, error } = await client
      .from(USER_PROFILE_TABLE)
      .delete()
      .eq('email', email)
      .eq('is_deleted', false)
      .select('id');

    if (error) {
      console.error('[fleetSync] hardDeleteUserProfileByEmail delete error:', error);
      throw error;
    }
    result.deleted = (data as unknown[] | null)?.length ?? 0;
  } catch (err) {
    console.warn('[fleetSync] hardDeleteUserProfileByEmail delete failed:', err);
    throw err;
  }

  // 2) soft-mark 任何殘留的 is_deleted=true row 為實際刪除（雖然 fetchUserProfiles 已過濾）
  //    這是雙保險：避免未來有人改 filter 又復活
  try {
    await client.from(USER_PROFILE_TABLE).delete().eq('email', email);
  } catch {
    /* ignore */
  }

  return result;
}

// ============================================================
// 配送數據分析（Delivery Analytics）
// ============================================================

/** 取得時間範圍的起始日期（根據天數） */
function getDaysStartDate(days: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
}

/** 儀表板分析資料介面 */
export interface DeliveryAnalyticsData {
  totalOrders: number;
  ordersChange: number; // 環比增減百分比
  avgDurationMinutes: number | null;
  avgDurationFormatted: string;
  efficiencyRate: number | null;
  activeDriversCount: number;
  chartData: ChartDataPoint[];
}

/** 圖表資料點 */
export interface ChartDataPoint {
  date: string;
  label: string;
  orderCount: number;
  avgDuration: number | null;
}

/** 獲取配送分析數據 */
export async function fetchDeliveryAnalytics(
  days: number = 30,
  companyId?: string | null,
  userRole?: string
): Promise<DeliveryAnalyticsData> {
  // 檢查環境變數
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.warn('[fleetSync] Supabase env not configured');
    return {
      totalOrders: 0,
      ordersChange: 0,
      avgDurationMinutes: null,
      avgDurationFormatted: 'N/A',
      efficiencyRate: null,
      activeDriversCount: 0,
      chartData: [],
    };
  }

  const startDate = getDaysStartDate(days);
  const now = new Date();

  // 根據權限構建公司過濾條件
  let companyFilter = '';
  if (userRole === 'company' && companyId) {
    companyFilter = `company_id=eq.${encodeURIComponent(companyId)}&`;
  }

  // 1. 獲取指定時間範圍內的已完成配送單（signed 狀態）
  const currentPeriodUrl = `${supabaseUrl}/rest/v1/delivery_orders?${companyFilter}status=eq.signed&signed_at=gte.${startDate.toISOString()}&signed_at=lte.${now.toISOString()}&is_deleted=eq.false&order=signed_at.asc`;

  let signedOrders: DbDeliveryOrder[] = [];
  try {
    const response = await fetch(currentPeriodUrl, {
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
    });
    if (response.ok) {
      signedOrders = await response.json();
    } else {
      console.error('[fleetSync] Failed to fetch orders:', response.status);
    }
  } catch (err) {
    console.error('[fleetSync] fetchDeliveryAnalytics error:', err);
  }

  // 2. 計算總簽收單數
  const totalOrders = signedOrders.length;

  // 3. 計算平均配送時間（從 assigned_at 到 signed_at 或從 in_transit_at 到 signed_at）
  let totalDurationMs = 0;
  let durationCount = 0;

  for (const order of signedOrders) {
    if (order.signed_at) {
      const startTime = order.in_transit_at || order.assigned_at || order.picked_up_at;
      if (startTime) {
        const start = new Date(startTime).getTime();
        const end = new Date(order.signed_at).getTime();
        if (!isNaN(start) && !isNaN(end) && end > start) {
          totalDurationMs += end - start;
          durationCount++;
        }
      }
    }
  }

  const avgDurationMinutes = durationCount > 0 ? Math.round(totalDurationMs / durationCount / 60000) : null;
  const avgDurationFormatted = avgDurationMinutes !== null
    ? avgDurationMinutes >= 60
      ? `${Math.floor(avgDurationMinutes / 60)}h ${avgDurationMinutes % 60}m`
      : `${avgDurationMinutes}min`
    : 'N/A';

  // 4. 計算配送達標率（基於是否有 dropoff_time 並在預期時間內完成）
  // 達標定義：在 dropoff_time 之前完成簽收，或沒有設定 ETA 的訂單
  let onTimeCount = 0;
  for (const order of signedOrders) {
    if (!order.signed_at) continue;
    // 如果沒有預期送達時間，視為達標
    if (!order.dropoff_time) {
      onTimeCount++;
    } else {
      const signedTime = new Date(order.signed_at).getTime();
      const expectedTime = new Date(order.dropoff_time).getTime();
      if (signedTime <= expectedTime) {
        onTimeCount++;
      }
    }
  }
  const efficiencyRate = totalOrders > 0 ? Math.round((onTimeCount / totalOrders) * 100) : null;

  // 5. 計算當月活躍司機數（本月有完成配送的司機）
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthDriversUrl = `${supabaseUrl}/rest/v1/delivery_orders?${companyFilter}status=eq.signed&signed_at=gte.${monthStart.toISOString()}&is_deleted=eq.false&select=assigned_driver_id`;
  let activeDrivers = new Set<string>();
  try {
    const response = await fetch(monthDriversUrl, {
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
    });
    if (response.ok) {
      const driverOrders: { assigned_driver_id: string | null }[] = await response.json();
      for (const order of driverOrders) {
        if (order.assigned_driver_id) {
          activeDrivers.add(order.assigned_driver_id);
        }
      }
    }
  } catch (err) {
    console.error('[fleetSync] fetchActiveDrivers error:', err);
  }
  const activeDriversCount = activeDrivers.size;

  // 6. 計算環比（與上一個相同週期相比）
  let ordersChange = 0;
  const prevStartDate = new Date(startDate);
  const periodDuration = now.getTime() - startDate.getTime();
  const prevEndDate = new Date(startDate.getTime() - 1);
  const prevStartOfPeriod = new Date(prevStartDate.getTime() - periodDuration);

  const prevPeriodUrl = `${supabaseUrl}/rest/v1/delivery_orders?${companyFilter}status=eq.signed&signed_at=gte.${prevStartOfPeriod.toISOString()}&signed_at=lte.${prevEndDate.toISOString()}&is_deleted=eq.false&select=id`;
  try {
    const response = await fetch(prevPeriodUrl, {
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
    });
    if (response.ok) {
      const prevOrders: { id: string }[] = await response.json();
      const prevTotal = prevOrders.length;
      if (prevTotal > 0) {
        ordersChange = Math.round(((totalOrders - prevTotal) / prevTotal) * 100);
      } else if (totalOrders > 0) {
        ordersChange = 100; // 從 0 到有值
      }
    }
  } catch (err) {
    console.error('[fleetSync] fetchPrevPeriodOrders error:', err);
  }

  // 7. 生成圖表數據（按天聚合）
  const chartData = generateChartData(signedOrders, days);

  return {
    totalOrders,
    ordersChange,
    avgDurationMinutes,
    avgDurationFormatted,
    efficiencyRate,
    activeDriversCount,
    chartData,
  };
}

/** 生成圖表數據 */
function generateChartData(orders: DbDeliveryOrder[], days: number): ChartDataPoint[] {
  if (orders.length === 0) return [];

  const dataMap = new Map<string, { count: number; totalDuration: number; durationCount: number }>();

  // 初始化所有日期
  const now = new Date();
  const startDate = getDaysStartDate(days);
  const daysDiff = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  for (let i = 0; i <= daysDiff; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    dataMap.set(key, { count: 0, totalDuration: 0, durationCount: 0 });
  }

  // 聚合訂單數據
  for (const order of orders) {
    if (!order.signed_at) continue;
    const signedDate = new Date(order.signed_at);
    const key = `${signedDate.getFullYear()}-${String(signedDate.getMonth() + 1).padStart(2, '0')}-${String(signedDate.getDate()).padStart(2, '0')}`;

    const existing = dataMap.get(key);
    if (existing) {
      existing.count++;
      // 計算耗時
      const startTime = order.in_transit_at || order.assigned_at || order.picked_up_at;
      if (startTime) {
        const start = new Date(startTime).getTime();
        const end = new Date(order.signed_at).getTime();
        if (!isNaN(start) && !isNaN(end) && end > start) {
          existing.totalDuration += (end - start) / 60000; // 轉換為分鐘
          existing.durationCount++;
        }
      }
    }
  }

  // 轉換為圖表數據格式
  const result: ChartDataPoint[] = [];
  const sortedKeys = Array.from(dataMap.keys()).sort();

  for (const key of sortedKeys) {
    const data = dataMap.get(key)!;
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    // 格式化標籤
    const label = `${date.getMonth() + 1}/${date.getDate()}`;

    result.push({
      date: key,
      label,
      orderCount: data.count,
      avgDuration: data.durationCount > 0 ? Math.round(data.totalDuration / data.durationCount) : null,
    });
  }

  return result;
}

// ============================================================
// route_config 表操作（路線設定同步）
// ============================================================

const ROUTE_CONFIG_TABLE = 'route_config';

export interface RouteConfigSync {
  id: string;
  user_id: string;
  provider: string;
  api_key_hash: string;
  api_key_masked: string;
  default_strategy: string;
  enable_tsp_optimization: boolean;
  default_start_location: string;
  default_end_location: string;
  depot_address: string | null;
  depot_coords: { lat: number; lng: number } | null;
  avoid_tolls: boolean;
  avoid_highways: boolean;
  consider_traffic: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 從 route_config 表獲取路線設定
 */
export async function getRouteConfigSync(): Promise<RouteConfigSync | null> {
  try {
    const client = ensureClient();
    const userId = getCurrentUserId();

    if (!userId) {
      return null;
    }

    const { data, error } = await client
      .from(ROUTE_CONFIG_TABLE)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // 404 表示表不存在，忽略錯誤
    if (error && error.code !== 'PGRST116') {
      console.warn('[fleetSync] getRouteConfigSync error:', error.message || error);
      return null;
    }

    return data as RouteConfigSync | null;
  } catch (err) {
    console.warn('[fleetSync] getRouteConfigSync exception:', err);
    return null;
  }
}

/**
 * 將路線設定同步到 Supabase（upsert by user_id）
 */
export async function syncRouteConfig(config: {
  provider?: string;
  apiKeyHash?: string;
  apiKeyMasked?: string;
  defaultStrategy?: string;
  enableTspOptimization?: boolean;
  defaultStartLocation?: string;
  defaultEndLocation?: string;
  depotAddress?: string;
  depotCoords?: { lat: number; lng: number };
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  considerTraffic?: boolean;
}): Promise<boolean> {
  try {
    const client = ensureClient();
    const userId = getCurrentUserId();

    if (!userId) {
      throw new Error('User not authenticated, cannot sync route config.');
    }

    const payload: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    if (config.provider !== undefined) payload.provider = config.provider;
    if (config.apiKeyHash !== undefined) payload.api_key_hash = config.apiKeyHash;
    if (config.apiKeyMasked !== undefined) payload.api_key_masked = config.apiKeyMasked;
    if (config.defaultStrategy !== undefined) payload.default_strategy = config.defaultStrategy;
    if (config.enableTspOptimization !== undefined) payload.enable_tsp_optimization = config.enableTspOptimization;
    if (config.defaultStartLocation !== undefined) payload.default_start_location = config.defaultStartLocation;
    if (config.defaultEndLocation !== undefined) payload.default_end_location = config.defaultEndLocation;
    if (config.depotAddress !== undefined) payload.depot_address = config.depotAddress || null;
    if (config.depotCoords !== undefined) payload.depot_coords = config.depotCoords || null;
    if (config.avoidTolls !== undefined) payload.avoid_tolls = config.avoidTolls;
    if (config.avoidHighways !== undefined) payload.avoid_highways = config.avoidHighways;
    if (config.considerTraffic !== undefined) payload.consider_traffic = config.considerTraffic;

    const { error } = await client
      .from(ROUTE_CONFIG_TABLE)
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      console.error('[fleetSync] syncRouteConfig error:', error);
      return false;
    }

    console.log('[fleetSync] Synced route config to Supabase');
    return true;
  } catch (err) {
    console.error('[fleetSync] syncRouteConfig exception:', err);
    return false;
  }
}

/**
 * 清除路線設定
 */
export async function clearRouteConfigSync(): Promise<boolean> {
  try {
    const client = ensureClient();
    const userId = getCurrentUserId();

    if (!userId) {
      return false;
    }

    const { error } = await client
      .from(ROUTE_CONFIG_TABLE)
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('[fleetSync] clearRouteConfigSync error:', error);
      return false;
    }

    console.log('[fleetSync] Cleared route config from Supabase');
    return true;
  } catch (err) {
    console.error('[fleetSync] clearRouteConfigSync exception:', err);
    return false;
  }
}
