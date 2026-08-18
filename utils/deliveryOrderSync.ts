/**
 * deliveryOrderSync.ts — 共享配送單同步工具
 *
 * 使用共享的 delivery_orders 表，讓司機能看到被指派的配送單。
 */

import { DeliveryOrder, DeliveryPhoto, SignatureStroke, DeliveryCargoItem } from '@/types';

const TABLE_NAME = 'delivery_orders';

function getSupabaseConfig() {
  // 使用與 fleetSync.ts 相同的環境變數檢查
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  console.log('[deliveryOrderSync] URL:', url ? 'SET' : 'NOT SET', 'Key:', anonKey ? 'SET' : 'NOT SET');
  
  if (!url || !anonKey) {
    console.error('[deliveryOrderSync] Supabase environment variables not set!');
    throw new Error('Supabase environment variables are not set');
  }

  return { url, anonKey };
}

interface DbDeliveryOrder {
  id: string;
  order_no: string;
  user_id: string | null;
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
  delivery_fee: number;
  cod_amount: number;
  notes: string | null;
  cargo_description: string | null;
  cargo_weight: number | null;
  cargo_items: DeliveryCargoItem[] | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  warehouse_image_url: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

async function supabaseRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  params?: Record<string, string>,
  customHeaders?: Record<string, string>
): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();

  let queryString = '';
  if (params) {
    const entries = Object.entries(params);
    if (entries.length > 0) {
      queryString = '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    }
  }

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      apikey: anonKey,
      Prefer: 'return=representation',
      ...customHeaders,
    },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  console.log('[supabaseRequest]', method, `${url}${path}${queryString}`);

  const response = await fetch(`${url}${path}${queryString}`, options);
  console.log('[supabaseRequest] Response status:', response.status);

  const contentLength = response.headers.get('content-length');
  if (response.status === 204 || contentLength === '0') {
    return {} as T;
  }

  const data = await response.json();
  console.log('[supabaseRequest] Response data:', JSON.stringify(data).substring(0, 200));

  // 如果返回錯誤，拋出異常
  if (!response.ok) {
    const errorMsg = data?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

/**
 * 直接從 Supabase 測試查詢配送單（調試用）
 */
export async function testFetchDeliveries(userId: string): Promise<{ success: boolean; data: unknown; error?: string }> {
  try {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    
    console.log('[deliveryOrderSync] testFetch - URL:', url ? 'SET' : 'NOT SET');
    console.log('[deliveryOrderSync] testFetch - Key:', anonKey ? 'SET' : 'NOT SET');
    
    if (!url || !anonKey) {
      return { success: false, data: null, error: 'Missing env vars' };
    }
    
    const response = await fetch(
      `${url}/rest/v1/${TABLE_NAME}?is_deleted=eq.false&assigned_driver_id=eq.${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
      }
    );
    
    const data = await response.json();
    console.log('[deliveryOrderSync] testFetch - Response status:', response.status);
    console.log('[deliveryOrderSync] testFetch - Data:', JSON.stringify(data).substring(0, 500));
    
    return { success: response.ok, data };
  } catch (err) {
    console.error('[deliveryOrderSync] testFetch error:', err);
    return { success: false, data: null, error: String(err) };
  }
}

function mapDbToDelivery(db: DbDeliveryOrder): DeliveryOrder {
  return {
    id: db.id,
    orderNo: db.order_no,
    userId: db.user_id ?? undefined,
    companyId: db.company_id ?? undefined,
    customerName: db.customer_name,
    customerPhone: db.customer_phone ?? undefined,
    pickupAddress: db.pickup_address,
    pickupContact: db.pickup_contact ?? undefined,
    pickupTime: db.pickup_time,
    pickupLatitude: db.pickup_latitude ?? undefined,
    pickupLongitude: db.pickup_longitude ?? undefined,
    dropoffAddress: db.dropoff_address,
    dropoffContact: db.dropoff_contact ?? undefined,
    dropoffPhone: db.dropoff_phone ?? undefined,
    dropoffLatitude: db.dropoff_latitude ?? undefined,
    dropoffLongitude: db.dropoff_longitude ?? undefined,
    status: db.status as DeliveryOrder['status'],
    assignedDriverId: db.assigned_driver_id ?? undefined,
    assignedDriverName: db.assigned_driver_name ?? undefined,
    assignedAt: db.assigned_at ?? undefined,
    signatureData: db.signature_data ?? undefined,
    signedAt: db.signed_at ?? undefined,
    signatureStrokes: db.signature_strokes ?? undefined,
    photos: db.photos ?? undefined,
    pickupPhotos: db.pickup_photos ?? undefined,
    deliveryFee: db.delivery_fee,
    codAmount: db.cod_amount,
    notes: db.notes ?? undefined,
    cargoDescription: db.cargo_description ?? '',
    cargoWeight: db.cargo_weight ?? 0,
    cargoItems: db.cargo_items ?? undefined,
    warehouseId: db.warehouse_id ?? undefined,
    warehouseName: db.warehouse_name ?? undefined,
    // ★ 兼容：warehouse_image_url 在某些部署中可能不存在
    warehouseImageUrl: (db as Partial<DbDeliveryOrder>).warehouse_image_url ?? undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function mapDeliveryToDb(order: DeliveryOrder): Partial<DbDeliveryOrder> {
  // ★ 只寫入資料庫真實存在的欄位，避免 schema cache 錯誤導致同步失敗
  // 重要：warehouse_image_url 等客戶端專用欄位不能寫到這個表
  return {
    id: order.id,
    order_no: order.orderNo,
    user_id: order.userId ?? null,
    company_id: order.companyId ?? null,
    customer_name: order.customerName,
    customer_phone: order.customerPhone ?? null,
    pickup_address: order.pickupAddress,
    pickup_contact: order.pickupContact ?? null,
    pickup_time: order.pickupTime,
    pickup_latitude: order.pickupLatitude ?? null,
    pickup_longitude: order.pickupLongitude ?? null,
    dropoff_address: order.dropoffAddress,
    dropoff_contact: order.dropoffContact ?? null,
    dropoff_phone: order.dropoffPhone ?? null,
    dropoff_latitude: order.dropoffLatitude ?? null,
    dropoff_longitude: order.dropoffLongitude ?? null,
    status: order.status,
    assigned_driver_id: order.assignedDriverId ?? null,
    assigned_driver_name: order.assignedDriverName ?? null,
    assigned_at: order.assignedAt ?? null,
    signature_data: order.signatureData ?? null,
    signed_at: order.signedAt ?? null,
    signature_strokes: order.signatureStrokes ?? null,
    photos: order.photos ?? [],
    pickup_photos: order.pickupPhotos ?? [],
    delivery_fee: order.deliveryFee ?? 0,
    cod_amount: order.codAmount ?? 0,
    notes: order.notes ?? null,
    cargo_description: order.cargoDescription ?? '',
    cargo_weight: order.cargoWeight ?? 0,
    cargo_items: order.cargoItems ?? null,
    warehouse_id: order.warehouseId ?? null,
    warehouse_name: order.warehouseName ?? null,
    // ★ 暫時不寫入：warehouse_image_url 在 delivery_orders 表不存在
    // 如需儲存，改用其他方式（例如另一個獨立的倉庫表）
    // warehouse_image_url: order.warehouseImageUrl ?? null,
    created_at: order.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_deleted: false,
  };
}

/**
 * 從 delivery_orders 表獲取所有未刪除的配送單
 */
export async function fetchAllDeliveries(): Promise<DeliveryOrder[]> {
  try {
    const data = await supabaseRequest<{ data: DbDeliveryOrder[] }>(
      'GET',
      `/rest/v1/${TABLE_NAME}?is_deleted=eq.false&order=created_at.desc`,
    );

    return (data?.data || []).map(mapDbToDelivery);
  } catch (err) {
    console.error('[deliveryOrderSync] fetchAllDeliveries error:', err);
    return [];
  }
}

/**
 * 根據角色獲取配送單
 * - admin: 所有配送單
 * - company: 自己公司的配送單
 * - driver: 指派給自己的配送單
 */
export async function fetchDeliveriesByRole(
  role: string,
  userId: string,
  companyId?: string
): Promise<DeliveryOrder[]> {
  try {
    let url = `/rest/v1/${TABLE_NAME}?is_deleted=eq.false`;

    if (role === 'admin' || role === 'superadmin') {
      url += '&order=created_at.desc';
    } else if (role === 'company' && companyId) {
      url += `&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc`;
    } else if (role === 'company') {
      console.warn('[deliveryOrderSync] company role without companyId; returning empty list');
      return [];
    } else if (role === 'driver' && userId) {
      url += `&assigned_driver_id=eq.${encodeURIComponent(userId)}&order=pickup_time.asc`;
    } else {
      url += `&assigned_driver_id=eq.${encodeURIComponent(userId)}&order=pickup_time.asc`;
    }

    console.log('[deliveryOrderSync] Full URL:', url);
    const data = await supabaseRequest<{ data: DbDeliveryOrder[] }>('GET', url);
    console.log('[deliveryOrderSync] Response items:', data?.data?.length ?? 0);
    return (data?.data || []).map(mapDbToDelivery);
  } catch (err) {
    console.error('[deliveryOrderSync] fetchDeliveriesByRole error:', err);
    return [];
  }
}

/**
 * 獲取指派給特定司機的配送單
 */
export async function fetchDeliveriesForDriver(driverId: string): Promise<DeliveryOrder[]> {
  try {
    const data = await supabaseRequest<{ data: DbDeliveryOrder[] }>(
      'GET',
      `/rest/v1/${TABLE_NAME}?is_deleted=eq.false&assigned_driver_id=eq.${encodeURIComponent(driverId)}&order=pickup_time.asc`,
    );

    return (data?.data || []).map(mapDbToDelivery);
  } catch (err) {
    console.error('[deliveryOrderSync] fetchDeliveriesForDriver error:', err);
    return [];
  }
}

/**
 * 同步配送單到 delivery_orders 表（upsert by id）
 */
export async function upsertDeliveryOrder(order: DeliveryOrder): Promise<void> {
  const dbOrder = mapDeliveryToDb(order);

  // 使用 Supabase upsert，需要添加 Prefer header
  // onConflict 在 Supabase 中通過 Prefer header 指定
  await supabaseRequest(
    'POST',
    `/rest/v1/${TABLE_NAME}`,
    dbOrder,
    undefined,
    { 'Prefer': 'resolution=merge-duplicates,return=representation' }
  );

  console.log(`[deliveryOrderSync] Upserted delivery order: ${order.orderNo}`);
}

/**
 * 批次同步配送單到 delivery_orders 表
 */
export async function upsertDeliveryOrders(orders: DeliveryOrder[]): Promise<void> {
  for (const order of orders) {
    try {
      await upsertDeliveryOrder(order);
    } catch (err) {
      console.error(`[deliveryOrderSync] Failed to upsert order ${order.orderNo}:`, err);
    }
  }

  console.log(`[deliveryOrderSync] Synced ${orders.length} delivery orders`);
}

/**
 * 更新配送單狀態
 */
export async function updateDeliveryStatus(
  orderId: string,
  status: string,
  additionalFields?: Partial<DeliveryOrder>
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (additionalFields) {
    if (additionalFields.assignedDriverId !== undefined) {
      updates.assigned_driver_id = additionalFields.assignedDriverId;
    }
    if (additionalFields.assignedDriverName !== undefined) {
      updates.assigned_driver_name = additionalFields.assignedDriverName;
    }
    if (additionalFields.signatureData !== undefined) {
      updates.signature_data = additionalFields.signatureData;
    }
    if (additionalFields.signedAt !== undefined) {
      updates.signed_at = additionalFields.signedAt;
    }
    if (additionalFields.signatureStrokes !== undefined) {
      updates.signature_strokes = additionalFields.signatureStrokes;
    }
  }

  await supabaseRequest(
    'PATCH',
    `/rest/v1/${TABLE_NAME}?id=eq.${encodeURIComponent(orderId)}`,
    updates
  );

  console.log(`[deliveryOrderSync] Updated delivery order ${orderId} status to ${status}`);
}

/**
 * 指派司機到配送單
 */
export async function assignDriverToDelivery(
  orderId: string,
  driverId: string,
  driverName: string
): Promise<void> {
  await supabaseRequest(
    'PATCH',
    `/rest/v1/${TABLE_NAME}?id=eq.${encodeURIComponent(orderId)}`,
    {
      assigned_driver_id: driverId,
      assigned_driver_name: driverName,
      assigned_at: new Date().toISOString(),
      status: 'assigned'
    }
  );

  console.log(`[deliveryOrderSync] Assigned driver ${driverName} to delivery ${orderId}`);
}

/**
 * 刪除配送單（軟刪除）
 */
export async function softDeleteDeliveryOrder(orderId: string): Promise<void> {
  await supabaseRequest(
    'PATCH',
    `/rest/v1/${TABLE_NAME}?id=eq.${encodeURIComponent(orderId)}`,
    { is_deleted: true }
  );

  console.log(`[deliveryOrderSync] Soft deleted delivery order ${orderId}`);
}
