import { create } from 'zustand';
import { Alert } from 'react-native';
import { DeliveryOrder, DeliveryStatus, SignatureStroke, DeliveryPhoto } from '@/types';
import { storage } from '@/utils/storage';
import { fetchFleetSnapshot, hasSupabaseEnv, pushFleetSnapshot } from '@/utils/fleetSync';
import { uploadDeliveryPhoto } from '@/utils/supabaseStorage';

const STORAGE_KEY = 'deliveries';
const DELIVERY_FLOW: DeliveryStatus[] = ['pending', 'assigned', 'in_transit', 'delivered', 'signed'];

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
  await storage.setItem(STORAGE_KEY, JSON.stringify(deliveries));
}

function pushDeliveriesInBackground(deliveries: DeliveryOrder[], onError: (message: string) => void) {
  if (!hasSupabaseEnv) {
    return;
  }

  void pushFleetSnapshot({ deliveries }).catch((err) => {
    onError(err instanceof Error ? err.message : 'Delivery sync failed');
  });
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
  addPhoto: (deliveryId: string, photoUri: string) => Promise<void>;
  removePhoto: (deliveryId: string, photoId: string) => Promise<void>;
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
      const stored = await storage.getItem(STORAGE_KEY);
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
    if (!hasSupabaseEnv) {
      return;
    }

    set({ isSyncing: true, syncError: null });
    try {
      const remote = await fetchFleetSnapshot();
      if (remote) {
        set({ deliveries: remote.deliveries });
        await persistDeliveries(remote.deliveries);
      } else {
        const localDeliveries = get().deliveries;
        await persistDeliveries(localDeliveries);
        await pushFleetSnapshot({ deliveries: localDeliveries });
      }
    } catch (err) {
      set({ syncError: err instanceof Error ? err.message : 'Delivery sync failed' });
    } finally {
      set({ isSyncing: false });
    }
  },

  addOrder: async (order) => {
    const now = new Date();
    const id = `del${Date.now()}`;
    const orderNo = `WO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(get().deliveries.length + 1).padStart(3, '0')}`;
    const newOrder: DeliveryOrder = normalizeDelivery({
      ...order,
      id,
      orderNo,
      createdAt: now.toISOString(),
    }, now);
    const updated = [newOrder, ...get().deliveries];
    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));
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
  },

  addPhoto: async (deliveryId, photoUri) => {
    let finalUri = photoUri;

    // Web 平台：blob URL 或 base64 需要先上傳到 Supabase Storage
    if (typeof window !== 'undefined' && (photoUri.startsWith('blob:') || photoUri.startsWith('data:'))) {
      try {
        finalUri = await uploadDeliveryPhoto(photoUri, deliveryId);
      } catch (err) {
        console.error('Failed to upload photo to Supabase:', err);
        Alert.alert(
          '上傳失敗',
          `無法上傳圖片到雲端: ${err instanceof Error ? err.message : '未知錯誤'}\n\n圖片將以本地形式保存，F5 後可能消失。`
        );
      }
    }

    const newPhoto: DeliveryPhoto = {
      id: `photo-${Date.now()}`,
      uri: finalUri,
      takenAt: new Date().toISOString(),
    };
    const updated = get().deliveries.map((delivery) =>
      delivery.id === deliveryId
        ? { ...delivery, photos: [...(delivery.photos ?? []), newPhoto] }
        : delivery
    );
    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));
  },

  removePhoto: async (deliveryId, photoId) => {
    const updated = get().deliveries.map((delivery) =>
      delivery.id === deliveryId
        ? { ...delivery, photos: (delivery.photos ?? []).filter((p) => p.id !== photoId) }
        : delivery
    );
    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));
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
