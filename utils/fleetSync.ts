import { Vehicle, User, DeliveryOrder, DeliveryStatus, SignatureStroke, DeliveryPhoto } from '@/types';
import { supabase } from './supabase';

const VEHICLES_TABLE = 'vehicles';
const TABLE_NAME = 'fleet_sync';

export const hasSupabaseEnv = Boolean(supabase);

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
