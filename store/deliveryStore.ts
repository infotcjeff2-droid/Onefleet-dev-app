import { create } from 'zustand';
import { Alert } from 'react-native';
import { DeliveryOrder, DeliveryStatus, SignatureStroke, DeliveryPhoto } from '@/types';
import { storage } from '@/utils/storage';
import { hasSupabaseEnv } from '@/utils/supabase';
import { uploadDeliveryPhoto } from '@/utils/supabaseStorage';
import { upsertDeliveryOrder, updateDeliveryStatus, assignDriverToDelivery } from '@/utils/deliveryOrderSync';
import { pushFleetSnapshot, updateDeliveryOrder as updateDeliveryOrderInSupabase } from '@/utils/fleetSync';
import { useAuthStore } from './authStore';

const DELIVERY_FLOW: DeliveryStatus[] = ['pending', 'assigned', 'in_transit', 'delivered', 'signed'];

function getStorageKey(): string {
  const userId = useAuthStore.getState().user?.id ?? 'guest';
  return `deliveries_${userId}`;
}

// 同步鎖，防止並發同步
let syncPromise: Promise<void> | null = null;

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
    assignedDriverId: effectiveStatus === 'expired' ? undefined : delivery.assignedDriverId,
    assignedDriverName: effectiveStatus === 'expired' ? undefined : delivery.assignedDriverName,
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
  loadDeliveries: () => Promise<void>;
  syncDeliveries: () => Promise<void>;
  addOrder: (order: Omit<DeliveryOrder, 'id' | 'createdAt' | 'orderNo'>) => Promise<void>;
  assignDriver: (deliveryId: string, driverId: string, driverName: string) => Promise<void>;
  removeDriver: (deliveryId: string) => Promise<void>;
  updateStatus: (deliveryId: string, status: DeliveryStatus) => Promise<void>;
  addSignature: (deliveryId: string, signatureData: string, signatureStrokes?: SignatureStroke[][]) => Promise<void>;
  addPhoto: (deliveryId: string, photoUri: string, isPickupPhoto?: boolean) => Promise<void>;
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
        // 司機只看指派給自己的
        queryUrl += `&assigned_driver_id=eq.${encodeURIComponent(userId)}`;
      } else if (userRole === 'company' && companyId) {
        // 公司只看自己公司的
        queryUrl += `&company_id=eq.${encodeURIComponent(companyId)}`;
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
        status: db.status as DeliveryOrder['status'],
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
        createdAt: db.created_at as string,
        updatedAt: db.updated_at as string,
        isCompleted: db.is_completed as boolean | undefined,
        completedAt: db.completed_at as string | undefined,
      }));
      
      console.log('[deliveryStore] Converted', remoteDeliveries.length, 'deliveries');
      
      // 直接使用遠端數據
      set({ deliveries: remoteDeliveries, isLoading: false, isSyncing: false });
      await persistDeliveries(remoteDeliveries);
      
      console.log('[deliveryStore] Synced', remoteDeliveries.length, 'deliveries to store');
    } catch (err) {
      console.error('[deliveryStore] syncDeliveries error:', err);
      set({ syncError: err instanceof Error ? err.message : 'Delivery sync failed' });
    } finally {
      set({ isSyncing: false });
    }
  },

  addOrder: async (order) => {
    const now = new Date();
    const id = `del${Date.now()}`;
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
      try {
        await upsertDeliveryOrder(newOrder);
        console.log('[deliveryStore] Synced new order to delivery_orders table');
      } catch (err) {
        console.error('[deliveryStore] Failed to sync order to delivery_orders:', err);
        // 記錄錯誤但不阻止成功流程
      }
    }
    
    // 返回新訂單以便調用方確認
    return newOrder;
  },

  assignDriver: async (deliveryId, driverId, driverName) => {
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
      } catch (err) {
        console.error('[deliveryStore] Failed to assign driver to delivery_orders:', err);
      }
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

  addPhoto: async (deliveryId, photoUri, isPickupPhoto = false) => {
    // 如果是 blob URL 或 data URL，必須上傳到 Supabase Storage
    if (typeof window !== 'undefined' && (photoUri.startsWith('blob:') || photoUri.startsWith('data:'))) {
      try {
        const finalUri = await uploadDeliveryPhoto(photoUri, deliveryId);
        const newPhoto: DeliveryPhoto = {
          id: `photo-${Date.now()}`,
          uri: finalUri,
          takenAt: new Date().toISOString(),
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
        return; // 上傳成功，直接返回
      } catch (err) {
        console.error('Failed to upload photo to Supabase:', err);
        Alert.alert(
          '上傳失敗',
          `無法上傳圖片到雲端: ${err instanceof Error ? err.message : '未知錯誤'}\n\n請稍後重試。`
        );
        return; // 上傳失敗，不保存本地 blob URL
      }
    }

    // 非 Web 平台或非 blob/data URL，直接保存本地 URI
    const newPhoto: DeliveryPhoto = {
      id: `photo-${Date.now()}`,
      uri: photoUri,
      takenAt: new Date().toISOString(),
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
