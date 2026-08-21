import { create } from 'zustand';
import { Alert } from 'react-native';
import { DeliveryOrder, DeliveryStatus, SignatureStroke, DeliveryPhoto } from '@/types';
import { storage } from '@/utils/storage';
import { hasSupabaseEnv } from '@/utils/supabase';
import { uploadDeliveryPhoto } from '@/utils/supabaseStorage';
import { upsertDeliveryOrder, updateDeliveryStatus, assignDriverToDelivery } from '@/utils/deliveryOrderSync';
import { pushFleetSnapshot, updateDeliveryOrder as updateDeliveryOrderInSupabase } from '@/utils/fleetSync';
import { useAuthStore } from './authStore';
import { compressImageCrossPlatform, savePendingPhotoToLocal, updatePendingPhotoStatus } from '@/utils/imageProcessor';

const DELIVERY_FLOW: DeliveryStatus[] = ['pending', 'assigned', 'in_transit', 'delivered', 'signed'];

function getStorageKey(): string {
  const userId = useAuthStore.getState().user?.id ?? 'guest';
  return `deliveries_${userId}`;
}

// 同步鎖，防止並發同步
let syncPromise: Promise<void> | null = null;
/** 分配鎖，防止分配後立即同步覆蓋 */
let assignInProgress = false;
/** 標記即將從 Supabase 覆蓋本地，應跳過此次同步 */
let skipNextSync = false;
/** 標記是否正在新增訂單，防止新增期間同步覆蓋本地數據 */
let addingOrderInProgress = false;
/** 等待新增訂單同步完成的通知器 */
let addOrderSyncResolver: (() => void) | null = null;
/** 新增訂單後的冷卻期（毫秒），防止同步立即覆蓋新數據 */
const ADD_ORDER_COOLDOWN_MS = 3000;
/** 分配後的冷卻期（毫秒），防止同步立即覆蓋分配結果 */
const ASSIGN_COOLDOWN_MS = 3000;
/** 最後一次新增訂單的時間戳 */
let lastAddOrderTime = 0;
/** 最後一次分配的時間戳 */
let lastAssignTime = 0;

function parsePickupTime(pickupTime: string) {
  const normalized = pickupTime.replace(' ', 'T').replace(/(\d{2}:\d{2})(?::\d{2})?$/, '$1:00');
  return new Date(normalized);
}

function isToday(date: Date, now: Date) {
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

export function isDeliveryExpired(delivery: DeliveryOrder, now = new Date()) {
  if (delivery.status === 'signed' || delivery.signatureData || delivery.signedAt) {
    return false;
  }

  // ★ 修復：已分配的訂單（在配送流程中）不應被判定為過期
  // 司機可能因為各種因素延遲取貨，不應該自動流失分配
  if (delivery.assignedDriverId && delivery.status === 'assigned') {
    return false;
  }

  const pickupDate = parsePickupTime(delivery.pickupTime);
  if (Number.isNaN(pickupDate.getTime())) {
    return false;
  }

  if (isToday(pickupDate, now)) {
    return false;
  }

  return pickupDate.getTime() < now.getTime();
}

export function getEffectiveDeliveryStatus(delivery: DeliveryOrder, now = new Date()): DeliveryStatus {
  return isDeliveryExpired(delivery, now) ? 'expired' : delivery.status;
}

function normalizeDelivery(delivery: DeliveryOrder, now = new Date()): DeliveryOrder {
  const effectiveStatus = getEffectiveDeliveryStatus(delivery, now);
  if (effectiveStatus === delivery.status) {
    return delivery;
  }

  return {
    ...delivery,
    status: effectiveStatus,
    // ★ 修復：即使 expired 也要保留分配司機資訊（保留歷史記錄）
    assignedDriverId: delivery.assignedDriverId,
    assignedDriverName: delivery.assignedDriverName,
  };
}

function canTransitionToStatus(current: DeliveryOrder, nextStatus: DeliveryStatus) {
  if (current.status === 'signed') {
    return false;
  }

  if (nextStatus === 'expired') {
    return true;
  }

  const currentIdx = DELIVERY_FLOW.indexOf(current.status);
  const nextIdx = DELIVERY_FLOW.indexOf(nextStatus);

  if (currentIdx < 0 || nextIdx < 0) {
    return false;
  }

  return nextIdx === currentIdx + 1;
}

async function persistDeliveries(deliveries: DeliveryOrder[]) {
  await storage.setItem(getStorageKey(), JSON.stringify(deliveries));
}

function pushDeliveriesInBackground(deliveries: DeliveryOrder[], onError: (message: string) => void) {
  if (!hasSupabaseEnv) {
    return;
  }

  // 如果有正在進行的同步，等待完成後再執行
  if (syncPromise) {
    syncPromise = syncPromise.then(() => {
      return pushFleetSnapshot({ deliveries })
        .catch((err) => {
          console.warn('[pushDeliveriesInBackground] Sync failed:', err);
          onError(err instanceof Error ? err.message : 'Delivery sync failed');
        })
        .catch(() => {}); // 防止鏈式錯誤
    });
  } else {
    syncPromise = pushFleetSnapshot({ deliveries })
      .catch((err) => {
        console.warn('[pushDeliveriesInBackground] Sync failed:', err);
        onError(err instanceof Error ? err.message : 'Delivery sync failed');
      })
      .catch(() => {}) // 防止鏈式錯誤
      .finally(() => {
        syncPromise = null;
      });
  }
}

interface DeliveryState {
  deliveries: DeliveryOrder[];
  isLoading: boolean;
  isSyncing: boolean;
  syncError: string | null;
  // 本地新建但尚未同步到 Supabase 的訂單 ID
  pendingNewOrderIds: string[];
  // 本地分配但尚未同步到 Supabase 的訂單 ID
  pendingAssignOrderIds: string[];
  loadDeliveries: () => Promise<void>;
  syncDeliveries: () => Promise<void>;
  addOrder: (order: Omit<DeliveryOrder, 'id' | 'createdAt' | 'orderNo'>) => Promise<DeliveryOrder>;
  assignDriver: (deliveryId: string, driverId: string, driverName: string) => Promise<void>;
  removeDriver: (deliveryId: string) => Promise<void>;
  updateStatus: (deliveryId: string, status: DeliveryStatus) => Promise<void>;
  updateOrderDetails: (deliveryId: string, updates: Partial<Pick<DeliveryOrder, 'customerName' | 'customerPhone' | 'pickupAddress' | 'dropoffAddress' | 'cargoDescription' | 'cargoWeight' | 'notes' | 'cargoItems' | 'warehouseId' | 'warehouseName'>>) => Promise<void>;
  addSignature: (deliveryId: string, signatureData: string, signatureStrokes?: SignatureStroke[][]) => Promise<void>;
  addPhoto: (deliveryId: string, photoUri: string, isPickupPhoto?: boolean, locationInfo?: { address?: string; latitude?: number; longitude?: number }) => Promise<void>;
  removePhoto: (deliveryId: string, photoId: string, isPickupPhoto?: boolean) => Promise<void>;
  recordPickupTime: (deliveryId: string) => Promise<void>;
  recordInTransitTime: (deliveryId: string) => Promise<void>;
  recordDeliveredTime: (deliveryId: string) => Promise<void>;
  completeDelivery: (deliveryId: string) => Promise<void>;
  syncExpiredDeliveries: () => Promise<void>;
  resetDeliveries: () => Promise<void>;
  getDeliveriesForDriver: (driverId: string) => DeliveryOrder[];
}

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  deliveries: [],
  isLoading: true,
  isSyncing: false,
  syncError: null,
  pendingNewOrderIds: [],
  pendingAssignOrderIds: [],

  loadDeliveries: async () => {
    try {
      const stored = await storage.getItem(getStorageKey());
      const key = getStorageKey();
      console.log('[deliveryStore] loadDeliveries - key:', key, 'stored:', stored ? 'yes' : 'no');
      if (stored) {
        set({ deliveries: JSON.parse(stored), isLoading: false });
      } else {
        set({ deliveries: [], isLoading: false });
      }
    } catch {
      set({ deliveries: [], isLoading: false });
    }
  },

  syncDeliveries: async () => {
    console.log('[deliveryStore] syncDeliveries called');
    console.log('[deliveryStore] hasSupabaseEnv:', hasSupabaseEnv);
    
    if (!hasSupabaseEnv) {
      console.log('[deliveryStore] NO SUPABASE ENV, skipping');
      return;
    }

    // 如果正在新增訂單，跳過此次同步以避免覆蓋本地新數據
    if (addingOrderInProgress) {
      console.log('[deliveryStore] Skipping sync - adding order in progress');
      return;
    }

    // 如果在新增訂單後的冷卻期內，跳過此次同步
    const now = Date.now();
    if (now - lastAddOrderTime < ADD_ORDER_COOLDOWN_MS) {
      console.log('[deliveryStore] Skipping sync - within cooldown period after addOrder');
      return;
    }

    // 如果在分配司機後的冷卻期內，跳過此次同步
    if (now - lastAssignTime < ASSIGN_COOLDOWN_MS) {
      console.log('[deliveryStore] Skipping sync - within cooldown period after assign');
      return;
    }

    // 如果剛完成分配司機，跳過此次同步以避免覆蓋本地狀態
    if (skipNextSync) {
      console.log('[deliveryStore] Skipping sync - assign driver in progress');
      skipNextSync = false;
      return;
    }

    set({ isSyncing: true, syncError: null });
    try {
      const currentUser = useAuthStore.getState().user;
      const userRole = currentUser?.role ?? 'user';
      const userId = currentUser?.id ?? '';
      const companyId = currentUser?.companyId;

      console.log('[deliveryStore] role:', userRole, 'userId:', userId, 'companyId:', companyId);

      // 直接從 Supabase REST API 獲取配送單
      const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      let queryUrl = `${url}/rest/v1/delivery_orders?is_deleted=eq.false`;

      if (userRole === 'driver') {
        // 司機只看指派給自己的配送單
        // ★ 支援雙重匹配：同時用 assigned_driver_id 和 assigned_driver_name 比對
        // 避免因 ID 格式不一致導致查詢失敗
        queryUrl += `&or=(assigned_driver_id.eq.${encodeURIComponent(userId)},assigned_driver_name.eq.${encodeURIComponent(currentUser?.name || '')})`;
      } else if (userRole === 'company' && userId) {
        // ★ 公司帳號的可見範圍 = 自己 + 旗下所有司機 (driver.user_profile.company_id === 此公司 id)。
        //   由於 delivery_orders 表用 user_id 記錄「建立者」,所以只要把 user_id 組成池即可
        //   (公司本人新增的單 user_id = 公司 id,司機新增的單 user_id = 該司機 id)。
        //   '斷開 relation' = 司機被改 companyId / 從 user_profile 移除 → 下次 sync 不會再撈到。
        let poolUserIds: string[] = [userId];
        try {
          const { useUserManagementStore } = await import('./userManagementStore');
          const ensureLoaded = useUserManagementStore.getState().users.length === 0
            ? await useUserManagementStore.getState().loadUsers()
            : Promise.resolve();
          await ensureLoaded;
          const relatedDrivers = useUserManagementStore.getState().getUsersByCompanyId(userId);
          for (const d of relatedDrivers) {
            if (d.role === 'driver' && d.id && !poolUserIds.includes(d.id)) {
              poolUserIds.push(d.id);
            }
          }
          console.log('[deliveryStore] company pool user_ids:', poolUserIds);
        } catch (err) {
          console.warn('[deliveryStore] failed to expand company pool, fallback to self only:', err);
        }
        const inList = poolUserIds.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
        queryUrl += `&user_id=in.(${inList})`;
      }
      queryUrl += '&order=pickup_time.asc';
      
      console.log('[deliveryStore] Fetching from:', queryUrl);
      
      const response = await fetch(queryUrl, {
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey!,
          'Content-Type': 'application/json',
        },
      });
      
      console.log('[deliveryStore] Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[deliveryStore] API error:', errorText);
        throw new Error(`API error: ${response.status}`);
      }
      
      const remoteData = await response.json();
      console.log('[deliveryStore] Got', remoteData.length, 'deliveries from API');
      
      // 轉換格式
      const remoteDeliveries: DeliveryOrder[] = remoteData.map((db: Record<string, unknown>) => ({
        id: db.id as string,
        orderNo: db.order_no as string,
        userId: db.user_id as string | undefined,
        companyId: db.company_id as string | undefined,
        customerName: db.customer_name as string,
        customerPhone: db.customer_phone as string | undefined,
        pickupAddress: db.pickup_address as string,
        pickupContact: db.pickup_contact as string | undefined,
        pickupTime: db.pickup_time as string,
        pickupLatitude: db.pickup_latitude as number | undefined,
        pickupLongitude: db.pickup_longitude as number | undefined,
        dropoffAddress: db.dropoff_address as string,
        dropoffContact: db.dropoff_contact as string | undefined,
        dropoffPhone: db.dropoff_phone as string | undefined,
        dropoffLatitude: db.dropoff_latitude as number | undefined,
        dropoffLongitude: db.dropoff_longitude as number | undefined,
        status: (db.status as DeliveryOrder['status']) || (db.assigned_driver_id ? 'assigned' : 'pending'),
        assignedDriverId: db.assigned_driver_id as string | undefined,
        assignedDriverName: db.assigned_driver_name as string | undefined,
        assignedAt: db.assigned_at as string | undefined,
        signatureData: db.signature_data as string | undefined,
        signedAt: db.signed_at as string | undefined,
        signatureStrokes: db.signature_strokes as SignatureStroke[][] | undefined,
        photos: db.photos as DeliveryPhoto[] | undefined,
        pickupPhotos: db.pickup_photos as DeliveryPhoto[] | undefined,
        pickedUpAt: db.picked_up_at as string | undefined,
        inTransitAt: db.in_transit_at as string | undefined,
        deliveredAt: db.delivered_at as string | undefined,
        deliveryFee: db.delivery_fee as number,
        codAmount: db.cod_amount as number,
        notes: db.notes as string | undefined,
        cargoDescription: (db.cargo_description as string | undefined) ?? '',
        cargoWeight: (db.cargo_weight as number | undefined) ?? 0,
        cargoItems: db.cargo_items as DeliveryOrder['cargoItems'],
        warehouseId: db.warehouse_id as string | undefined,
        warehouseName: db.warehouse_name as string | undefined,
        warehouseImageUrl: db.warehouse_image_url as string | undefined,
        createdAt: db.created_at as string,
        updatedAt: db.updated_at as string,
        isCompleted: db.is_completed as boolean | undefined,
        completedAt: db.completed_at as string | undefined,
      }));
      
      console.log('[deliveryStore] Converted', remoteDeliveries.length, 'deliveries');
      
      // ★ 修復：合併策略改為「以 ID 為準」而非「以 pending 標記為準」
      // 比較本地 vs 遠端，找出本地有但遠端沒有的訂單（可能因同步延遲尚未上傳成功）
      // 這樣即使 pendingNewOrderIds 被清空，也能保留本地新增的訂單
      const currentDeliveries = get().deliveries;
      const pendingNewOrderIds = get().pendingNewOrderIds;
      const pendingAssignOrderIds = get().pendingAssignOrderIds;
      const localNewOrders = currentDeliveries.filter((d) => pendingNewOrderIds.includes(d.id));
      
      // 如果有本地分配但尚未同步到 Supabase 的訂單，應用它們到遠端數據
      const localAssignedOrders = currentDeliveries.filter((d) => pendingAssignOrderIds.includes(d.id));
      
      // ★ 防守：比對 ID，找出本地有但遠端沒有的訂單（防止本地單被遠端覆蓋消失）
      const remoteIds = new Set(remoteDeliveries.map((d) => d.id));
      const localOnlyOrders = currentDeliveries.filter(
        (d) => !remoteIds.has(d.id) && !localNewOrders.some((n) => n.id === d.id)
      );
      
      if (localNewOrders.length > 0 || localAssignedOrders.length > 0 || localOnlyOrders.length > 0) {
        const totalPreserving = localNewOrders.length + localAssignedOrders.length + localOnlyOrders.length;
        console.log('[deliveryStore] Preserving local changes:', 
          localNewOrders.length, 'new orders,', localAssignedOrders.length, 'assigned orders,', localOnlyOrders.length, 'local-only orders');
        
        // 複製遠端數據並應用本地分配結果
        const mergedDeliveries = remoteDeliveries.map((remoteOrder) => {
          // 檢查是否有本地的分配結果
          const localAssign = localAssignedOrders.find((d) => d.id === remoteOrder.id);
          if (localAssign) {
            return {
              ...remoteOrder,
              assignedDriverId: localAssign.assignedDriverId,
              assignedDriverName: localAssign.assignedDriverName,
              status: localAssign.status,
            };
          }
          return remoteOrder;
        });
        
        // 將本地新建訂單加入（去除重複）
        for (const newOrder of localNewOrders) {
          const existsInRemote = mergedDeliveries.some((d) => d.id === newOrder.id);
          if (!existsInRemote) {
            mergedDeliveries.push(newOrder);
          }
        }
        
        // ★ 將本地有但遠端沒有的訂單加入（防止資料被覆蓋清空）
        for (const localOnly of localOnlyOrders) {
          const existsInRemote = mergedDeliveries.some((d) => d.id === localOnly.id);
          if (!existsInRemote) {
            mergedDeliveries.push(localOnly);
          }
        }
        
        set({ deliveries: mergedDeliveries, isLoading: false, isSyncing: false });
        await persistDeliveries(mergedDeliveries);
        console.log('[deliveryStore] Synced', mergedDeliveries.length, 'deliveries to store (including local changes)');
        
        // ★ 確認後才清空 pendingNewOrderIds：只在遠端真的找到時才清空
        const remoteIds = new Set(remoteDeliveries.map((d) => d.id));
        const stillPending = get().pendingNewOrderIds.filter((id) => !remoteIds.has(id));
        if (stillPending.length !== get().pendingNewOrderIds.length) {
          set({ pendingNewOrderIds: stillPending });
          console.log('[deliveryStore] Cleared', get().pendingNewOrderIds.length - stillPending.length, 'confirmed pending new order IDs');
        }
        
        // 同樣處理 pendingAssignOrderIds
        const stillPendingAssign = get().pendingAssignOrderIds.filter((id) => {
          // 只有從遠端拉回來且狀態正確的才算確認
          const remoteOrder = remoteDeliveries.find((d) => d.id === id);
          if (!remoteOrder) return true; // 還沒確認
          return remoteOrder.status !== 'assigned' || !remoteOrder.assigned_driver_id;
        });
        if (stillPendingAssign.length !== get().pendingAssignOrderIds.length) {
          set({ pendingAssignOrderIds: stillPendingAssign });
        }
      } else {
        // 直接使用遠端數據
        set({ deliveries: remoteDeliveries, isLoading: false, isSyncing: false });
        await persistDeliveries(remoteDeliveries);
        console.log('[deliveryStore] Synced', remoteDeliveries.length, 'deliveries to store');
      }
      
      // ★ 主動重試：syncDeliveries 結束後，重試上傳任何仍在 pending 的訂單
      // 解決「新增後本地有但 Supabase 沒拉回來」的問題
      const stillPendingIds = get().pendingNewOrderIds;
      if (stillPendingIds.length > 0 && hasSupabaseEnv) {
        console.log('[deliveryStore] Retrying upload for', stillPendingIds.length, 'pending orders');
        const allLocal = get().deliveries;
        for (const pendingId of stillPendingIds) {
          const order = allLocal.find((d) => d.id === pendingId);
          if (order) {
            try {
              await upsertDeliveryOrder(order);
              console.log('[deliveryStore] Retry uploaded:', pendingId);
            } catch (err) {
              console.warn('[deliveryStore] Retry upload failed for:', pendingId, err);
            }
          }
        }
      }
    } catch (err) {
      console.error('[deliveryStore] syncDeliveries error:', err);
      set({ syncError: err instanceof Error ? err.message : 'Delivery sync failed' });
    } finally {
      set({ isSyncing: false });
    }
  },

  addOrder: async (order) => {
    // 防止新增訂單期間同步覆蓋本地數據
    addingOrderInProgress = true;
    // 記錄新增訂單的時間，用於同步冷卻期
    lastAddOrderTime = Date.now();

    const now = new Date();
    const id = `del${Date.now()}`;
    // 記錄新建訂單的 ID，持續追蹤直到同步成功
    set((state) => ({ pendingNewOrderIds: [...state.pendingNewOrderIds, id] }));
    
    const orderNo = `WO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(get().deliveries.length + 1).padStart(3, '0')}`;
    const currentUser = useAuthStore.getState().user;
    const newOrder: DeliveryOrder = normalizeDelivery({
      ...order,
      id,
      orderNo,
      createdAt: now.toISOString(),
      userId: currentUser?.id,
      companyId: currentUser?.companyId,
    }, now);
    const updated = [newOrder, ...get().deliveries];
    set({ deliveries: updated });
    await persistDeliveries(updated);
    
    // 同步到本地存儲
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));
    
    // 同步到共享配送單表（失敗不阻止流程）
    if (hasSupabaseEnv) {
      let synced = false;
      let lastError: unknown = null;
      
      // ★ 重試機制：最多 3 次，每次延遲增加
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await upsertDeliveryOrder(newOrder);
          console.log(`[deliveryStore] Synced new order to delivery_orders table (attempt ${attempt})`);
          synced = true;
          break;
        } catch (err) {
          lastError = err;
          console.error(`[deliveryStore] Failed to sync order to delivery_orders (attempt ${attempt}/3):`, err);
          if (attempt < 3) {
            // 等待越來越長時間再重試
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          }
        }
      }
      
      if (!synced) {
        console.error('[deliveryStore] All 3 attempts failed to sync order. Local data preserved, but Supabase may not have this order.');
        set({ syncError: `新增配送單同步失敗: ${lastError instanceof Error ? lastError.message : 'Unknown error'}` });
        // 保持 pendingNewOrderIds，syncDeliveries 會嘗試重新同步
      }
    } else {
      // 無 Supabase 環境時也要移除標記
      set((state) => ({ pendingNewOrderIds: state.pendingNewOrderIds.filter((i) => i !== id) }));
    }
    
    // 解除新增訂單鎖，讓後續同步可以正常運作
    addingOrderInProgress = false;
    
    // 如果有等待中的 sync，通知它釋放鎖
    if (addOrderSyncResolver) {
      addOrderSyncResolver();
      addOrderSyncResolver = null;
    }
    
    // 返回新訂單以便調用方確認
    return newOrder;
  },

  assignDriver: async (deliveryId, driverId, driverName) => {
    // 防止分配後的同步覆蓋本地狀態
    skipNextSync = true;
    lastAssignTime = Date.now();
    // 記錄分配的訂單 ID，用於同步時保留分配結果（使用 store state）
    set((state) => ({ pendingAssignOrderIds: [...state.pendingAssignOrderIds, deliveryId] }));

    const updated = get().deliveries.map((delivery) => {
      if (delivery.id !== deliveryId) {
        return delivery;
      }

      if (getEffectiveDeliveryStatus(delivery) === 'expired') {
        return normalizeDelivery(delivery);
      }

      return normalizeDelivery({
        ...delivery,
        assignedDriverId: driverId,
        assignedDriverName: driverName,
        status: 'assigned',
      });
    });

    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));

    // 同步到共享配送單表
    if (hasSupabaseEnv) {
      try {
        await assignDriverToDelivery(deliveryId, driverId, driverName);
        console.log('[deliveryStore] Assigned driver to shared delivery_orders table');
        // ★ 修復：延遲清空 pendingAssignOrderIds，由 syncDeliveries 確認後再清空
        // 這樣可以確保即使 assignDriverToDelivery 失敗，下次同步會再嘗試
      } catch (err) {
        console.error('[deliveryStore] Failed to assign driver to delivery_orders:', err);
      } finally {
        // API 同步完成後，允許後續的 syncDeliveries 正常運作
        skipNextSync = false;
      }
    } else {
      // 無 Supabase 環境時也要解除鎖定
      skipNextSync = false;
      set((state) => ({ pendingAssignOrderIds: state.pendingAssignOrderIds.filter((i) => i !== deliveryId) }));
    }
  },

  removeDriver: async (deliveryId) => {
    const updated = get().deliveries.map((delivery) => {
      if (delivery.id !== deliveryId) {
        return delivery;
      }

      const nextBaseStatus = delivery.signatureData || delivery.signedAt ? 'signed' : 'pending';
      return normalizeDelivery({
        ...delivery,
        assignedDriverId: undefined,
        assignedDriverName: undefined,
        status: nextBaseStatus,
      });
    });

    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));
  },

  updateStatus: async (deliveryId, status) => {
    const currentDeliveries = get().deliveries;
    const found = currentDeliveries.find((d) => d.id === deliveryId);

    if (!found) {
      Alert.alert('Error', `找不到訂單: ${deliveryId}`);
      return;
    }

    if (!canTransitionToStatus(found, status)) {
      Alert.alert('Error', `無法轉換狀態: ${found.status} -> ${status}`);
      return;
    }

    const updated = currentDeliveries.map((delivery) =>
      delivery.id === deliveryId ? { ...delivery, status } : delivery,
    );

    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));

    // 同步狀態到共享配送單表
    if (hasSupabaseEnv) {
      try {
        await updateDeliveryStatus(deliveryId, status);
        console.log('[deliveryStore] Updated status in shared delivery_orders table');
      } catch (err) {
        console.error('[deliveryStore] Failed to update status in delivery_orders:', err);
      }
    }
  },

  updateOrderDetails: async (deliveryId, updates) => {
    const currentDeliveries = get().deliveries;
    const found = currentDeliveries.find((d) => d.id === deliveryId);

    if (!found) {
      Alert.alert('Error', `找不到訂單: ${deliveryId}`);
      return;
    }

    const updated = currentDeliveries.map((delivery) =>
      delivery.id === deliveryId ? { ...delivery, ...updates } : delivery,
    );

    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));

    // 同步到共享配送單表
    if (hasSupabaseEnv) {
      try {
        await updateDeliveryOrderInSupabase(deliveryId, updates);
        console.log('[deliveryStore] Updated order details in delivery_orders table');
      } catch (err) {
        console.error('[deliveryStore] Failed to update order details in delivery_orders:', err);
      }
    }
  },

  addSignature: async (deliveryId, signatureData, signatureStrokes) => {
    const now = new Date().toISOString();
    let finalSignatureData = signatureData;

    // Web 平台：將 base64 簽名上傳到 Supabase Storage
    if (typeof window !== 'undefined' && signatureData.startsWith('data:')) {
      try {
        finalSignatureData = await uploadDeliveryPhoto(signatureData, `sig-${deliveryId}`);
      } catch (err) {
        console.error('Failed to upload signature:', err);
        // 如果上傳失敗，仍然使用本地 base64
      }
    }

    const updated = get().deliveries.map((delivery) =>
      delivery.id === deliveryId
        ? normalizeDelivery({ ...delivery, signatureData: finalSignatureData, signedAt: now, status: 'signed', signatureStrokes })
        : delivery
    );
    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));

    // 同步簽名到共享配送單表
    if (hasSupabaseEnv) {
      try {
        await updateDeliveryStatus(deliveryId, 'signed', { 
          signatureData: finalSignatureData, 
          signedAt: now, 
          signatureStrokes 
        });
        console.log('[deliveryStore] Added signature to shared delivery_orders table');
      } catch (err) {
        console.error('[deliveryStore] Failed to add signature to delivery_orders:', err);
      }
    }
  },

  addPhoto: async (deliveryId, photoUri, isPickupPhoto = false, locationInfo) => {
    const photoId = `photo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 如果是 blob URL 或 data URL，必須上傳到 Supabase Storage
    if (typeof window !== 'undefined' && (photoUri.startsWith('blob:') || photoUri.startsWith('data:'))) {
      try {
        // 1. 先保存本地預覽（base64），讓用戶立即看到圖片
        let localPreviewUri = photoUri;
        if (typeof window !== 'undefined') {
          const savedPhotoId = await savePendingPhotoToLocal(deliveryId, photoUri, isPickupPhoto);
          if (savedPhotoId) {
            // 使用本地 base64 URI 立即顯示
            const pendingPhotos = JSON.parse(localStorage.getItem(`pending_delivery_photos_${deliveryId}`) || '[]');
            const pendingPhoto = pendingPhotos.find((p: any) => p.id === savedPhotoId);
            if (pendingPhoto) {
              localPreviewUri = pendingPhoto.uri;
            }
          }
        }
        
        // 2. 先在本地 store 添加照片（使用本地預覽 URI）
        const previewPhoto: DeliveryPhoto = {
          id: photoId,
          uri: localPreviewUri,
          takenAt: new Date().toISOString(),
          ...(isPickupPhoto && locationInfo && {
            locationAddress: locationInfo.address,
            locationLatitude: locationInfo.latitude,
            locationLongitude: locationInfo.longitude,
          }),
        };
        
        let updated = get().deliveries.map((delivery) =>
          delivery.id === deliveryId
            ? isPickupPhoto
              ? { ...delivery, pickupPhotos: [...(delivery.pickupPhotos ?? []), previewPhoto] }
              : { ...delivery, photos: [...(delivery.photos ?? []), previewPhoto] }
            : delivery
        );
        set({ deliveries: updated });
        await persistDeliveries(updated);
        pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));
        
        // 3. 在背景進行圖片壓縮
        let compressedUri = photoUri;
        try {
          console.log('[deliveryStore] Starting image compression...');
          compressedUri = await compressImageCrossPlatform(photoUri, 1280, 720, 0.7);
          console.log('[deliveryStore] Image compression completed');
        } catch (compressError) {
          console.warn('[deliveryStore] Image compression failed, using original:', compressError);
        }
        
        // 4. 上傳壓縮後的圖片
        console.log('[deliveryStore] Starting upload...');
        const finalUri = await uploadDeliveryPhoto(compressedUri, deliveryId);
        console.log('[deliveryStore] Upload completed:', finalUri);
        
        // 5. 更新本地狀態為上傳後的 URI
        updated = get().deliveries.map((delivery) =>
          delivery.id === deliveryId
            ? isPickupPhoto
              ? {
                  ...delivery,
                  pickupPhotos: (delivery.pickupPhotos ?? []).map((p) =>
                    p.id === photoId ? { ...p, uri: finalUri } : p
                  ),
                }
              : {
                  ...delivery,
                  photos: (delivery.photos ?? []).map((p) =>
                    p.id === photoId ? { ...p, uri: finalUri } : p
                  ),
                }
            : delivery
        );
        set({ deliveries: updated });
        await persistDeliveries(updated);
        pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));
        
        // 6. 更新本地預覽狀態為完成
        if (typeof window !== 'undefined') {
          updatePendingPhotoStatus(deliveryId, photoId, 'completed', finalUri);
        }

        // 如果是取貨相片，同步到 delivery_orders 表
        if (isPickupPhoto && hasSupabaseEnv) {
          const updatedDelivery = updated.find((d) => d.id === deliveryId);
          if (updatedDelivery) {
            try {
              await updateDeliveryOrderInSupabase(deliveryId, {
                pickupPhotos: updatedDelivery.pickupPhotos,
              });
              console.log('[deliveryStore] Synced pickup photos to delivery_orders');
            } catch (err) {
              console.error('[deliveryStore] Failed to sync pickup photos:', err);
            }
          }
        }

        // 如果是送達相片，同步到 delivery_orders 表
        if (!isPickupPhoto && hasSupabaseEnv) {
          const updatedDelivery = updated.find((d) => d.id === deliveryId);
          if (updatedDelivery) {
            try {
              await updateDeliveryOrderInSupabase(deliveryId, {
                photos: updatedDelivery.photos,
              });
              console.log('[deliveryStore] Synced delivery photos to delivery_orders');
            } catch (err) {
              console.error('[deliveryStore] Failed to sync delivery photos:', err);
            }
          }
        }
        return; // 上傳成功，直接返回
      } catch (err) {
        console.error('Failed to upload photo to Supabase:', err);
        
        // 如果上傳失敗，仍保留本地 blob URL
        const errorPhoto: DeliveryPhoto = {
          id: photoId,
          uri: photoUri,
          takenAt: new Date().toISOString(),
          ...(isPickupPhoto && locationInfo && {
            locationAddress: locationInfo.address,
            locationLatitude: locationInfo.latitude,
            locationLongitude: locationInfo.longitude,
          }),
        };
        
        let updated = get().deliveries.map((delivery) =>
          delivery.id === deliveryId
            ? isPickupPhoto
              ? { ...delivery, pickupPhotos: [...(delivery.pickupPhotos ?? []), errorPhoto] }
              : { ...delivery, photos: [...(delivery.photos ?? []), errorPhoto] }
            : delivery
        );
        set({ deliveries: updated });
        await persistDeliveries(updated);
        pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));
        
        Alert.alert(
          '上傳失敗',
          `無法上傳圖片到雲端: ${err instanceof Error ? err.message : '未知錯誤'}\n\n圖片已保存在本地，請稍後重試。`
        );
        return;
      }
    }

    // 非 Web 平台或非 blob/data URL，直接保存本地 URI
    const newPhoto: DeliveryPhoto = {
      id: photoId,
      uri: photoUri,
      takenAt: new Date().toISOString(),
      // 取貨相片時帶入位置資訊
      ...(isPickupPhoto && locationInfo && {
        locationAddress: locationInfo.address,
        locationLatitude: locationInfo.latitude,
        locationLongitude: locationInfo.longitude,
      }),
    };
    const updated = get().deliveries.map((delivery) =>
      delivery.id === deliveryId
        ? isPickupPhoto
          ? { ...delivery, pickupPhotos: [...(delivery.pickupPhotos ?? []), newPhoto] }
          : { ...delivery, photos: [...(delivery.photos ?? []), newPhoto] }
        : delivery
    );
    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));

    // 如果是取貨相片，同步到 delivery_orders 表
    if (isPickupPhoto && hasSupabaseEnv) {
      const updatedDelivery = updated.find((d) => d.id === deliveryId);
      if (updatedDelivery) {
        try {
          await updateDeliveryOrderInSupabase(deliveryId, {
            pickupPhotos: updatedDelivery.pickupPhotos,
          });
          console.log('[deliveryStore] Synced pickup photos to delivery_orders');
        } catch (err) {
          console.error('[deliveryStore] Failed to sync pickup photos:', err);
        }
      }
    }

    // 如果是送達相片，同步到 delivery_orders 表
    if (!isPickupPhoto && hasSupabaseEnv) {
      const updatedDelivery = updated.find((d) => d.id === deliveryId);
      if (updatedDelivery) {
        try {
          await updateDeliveryOrderInSupabase(deliveryId, {
            photos: updatedDelivery.photos,
          });
          console.log('[deliveryStore] Synced delivery photos to delivery_orders');
        } catch (err) {
          console.error('[deliveryStore] Failed to sync delivery photos:', err);
        }
      }
    }
  },

  removePhoto: async (deliveryId, photoId, isPickupPhoto = false) => {
    const updated = get().deliveries.map((delivery) =>
      delivery.id === deliveryId
        ? isPickupPhoto
          ? { ...delivery, pickupPhotos: (delivery.pickupPhotos ?? []).filter((p) => p.id !== photoId) }
          : { ...delivery, photos: (delivery.photos ?? []).filter((p) => p.id !== photoId) }
        : delivery
    );
    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));

    // 如果是取貨相片，同步刪除到 delivery_orders 表
    if (isPickupPhoto && hasSupabaseEnv) {
      const updatedDelivery = updated.find((d) => d.id === deliveryId);
      if (updatedDelivery) {
        try {
          await updateDeliveryOrderInSupabase(deliveryId, {
            pickupPhotos: updatedDelivery.pickupPhotos,
          });
          console.log('[deliveryStore] Synced pickup photos deletion to delivery_orders');
        } catch (err) {
          console.error('[deliveryStore] Failed to sync pickup photos deletion:', err);
        }
      }
    }

    // 如果是送達相片，同步刪除到 delivery_orders 表
    if (!isPickupPhoto && hasSupabaseEnv) {
      const updatedDelivery = updated.find((d) => d.id === deliveryId);
      if (updatedDelivery) {
        try {
          await updateDeliveryOrderInSupabase(deliveryId, {
            photos: updatedDelivery.photos,
          });
          console.log('[deliveryStore] Synced delivery photos deletion to delivery_orders');
        } catch (err) {
          console.error('[deliveryStore] Failed to sync delivery photos deletion:', err);
        }
      }
    }
  },

  recordPickupTime: async (deliveryId) => {
    const now = new Date().toISOString();
    const updated = get().deliveries.map((delivery) =>
      delivery.id === deliveryId
        ? { ...delivery, pickedUpAt: now }
        : delivery
    );
    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));

    // 同步取貨時間到 delivery_orders 表
    if (hasSupabaseEnv) {
      try {
        await updateDeliveryOrderInSupabase(deliveryId, {
          pickedUpAt: now,
        } as Partial<DeliveryOrder>);
        console.log('[deliveryStore] Synced pickup time to delivery_orders');
      } catch (err) {
        console.error('[deliveryStore] Failed to sync pickup time:', err);
      }
    }
  },

  recordInTransitTime: async (deliveryId) => {
    const now = new Date().toISOString();
    const updated = get().deliveries.map((delivery) =>
      delivery.id === deliveryId
        ? { ...delivery, inTransitAt: now }
        : delivery
    );
    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));
  },

  recordDeliveredTime: async (deliveryId) => {
    const now = new Date().toISOString();
    const updated = get().deliveries.map((delivery) =>
      delivery.id === deliveryId
        ? { ...delivery, deliveredAt: now }
        : delivery
    );
    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));
  },

  completeDelivery: async (deliveryId) => {
    const now = new Date().toISOString();
    const updated = get().deliveries.map((delivery) =>
      delivery.id === deliveryId
        ? { ...delivery, isCompleted: true, completedAt: now }
        : delivery
    );
    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));

    // 同步到 delivery_orders 表
    if (hasSupabaseEnv) {
      try {
        await updateDeliveryOrderInSupabase(deliveryId, { isCompleted: true, completedAt: now } as Partial<DeliveryOrder>);
        console.log('[deliveryStore] Synced isCompleted and completedAt to delivery_orders');
      } catch (err) {
        console.error('[deliveryStore] Failed to sync isCompleted:', err);
      }
    }
  },

  syncExpiredDeliveries: async () => {
    let changed = false;
    const deliveries = get().deliveries.map((delivery) => {
      const normalized = normalizeDelivery(delivery);
      if (normalized !== delivery) {
        changed = true;
      }
      return normalized;
    });

    if (changed) {
      set({ deliveries });
      await persistDeliveries(deliveries);
      pushDeliveriesInBackground(deliveries, (message) => set({ syncError: message }));
    }
  },

  resetDeliveries: async () => {
    set({ deliveries: [] });
    await persistDeliveries([]);
    pushDeliveriesInBackground([], (message) => set({ syncError: message }));
  },

  getDeliveriesForDriver: (driverId) => {
    return get().deliveries
      .map((delivery) => normalizeDelivery(delivery))
      .filter((delivery) => delivery.assignedDriverId === driverId);
  },
}));
