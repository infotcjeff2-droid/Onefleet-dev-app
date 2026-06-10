import { create } from 'zustand';
import { DeliveryOrder, DeliveryStatus, mockDeliveries } from '@/constants/mockData';
import { storage } from '@/utils/storage';
import { fetchFleetSnapshot, hasSupabaseEnv, pushFleetSnapshot } from '@/utils/fleetSync';

const STORAGE_KEY = 'deliveries';
const DELIVERY_FLOW: DeliveryStatus[] = ['pending', 'assigned', 'in_transit', 'delivered', 'signed'];

function parsePickupTime(pickupTime: string) {
  return new Date(pickupTime.replace(' ', 'T'));
}

export function isDeliveryExpired(delivery: DeliveryOrder, now = new Date()) {
  if (delivery.status === 'signed' || delivery.signatureData || delivery.signedAt) {
    return false;
  }

  const pickupDate = parsePickupTime(delivery.pickupTime);
  if (Number.isNaN(pickupDate.getTime())) {
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
  const currentStatus = getEffectiveDeliveryStatus(current);
  if (currentStatus === 'expired') {
    return nextStatus === 'expired';
  }

  if (nextStatus === 'expired') {
    return true;
  }

  return DELIVERY_FLOW.includes(nextStatus);
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
  addSignature: (deliveryId: string, signatureData: string) => Promise<void>;
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
        set({ deliveries: JSON.parse(stored).map((delivery: DeliveryOrder) => normalizeDelivery(delivery)), isLoading: false });
      } else {
        const initial = mockDeliveries.map((delivery) => normalizeDelivery(delivery));
        set({ deliveries: initial, isLoading: false });
        await persistDeliveries(initial);
      }
    } catch {
      set({ deliveries: mockDeliveries.map((delivery) => normalizeDelivery(delivery)), isLoading: false });
    }
  },

  syncDeliveries: async () => {
    if (!hasSupabaseEnv) {
      return;
    }

    set({ isSyncing: true, syncError: null });
    try {
      const remote = await fetchFleetSnapshot();
      if (remote?.deliveries?.length) {
        const normalized = remote.deliveries.map((delivery) => normalizeDelivery(delivery));
        set({ deliveries: normalized });
        await persistDeliveries(normalized);
      } else {
        const localDeliveries = get().deliveries.length ? get().deliveries : mockDeliveries.map((delivery) => normalizeDelivery(delivery));
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
    const updated = get().deliveries.map((delivery) => {
      if (delivery.id !== deliveryId) {
        return delivery;
      }

      if (!canTransitionToStatus(delivery, status)) {
        return normalizeDelivery(delivery);
      }

      return normalizeDelivery({ ...delivery, status });
    });

    set({ deliveries: updated });
    await persistDeliveries(updated);
    pushDeliveriesInBackground(updated, (message) => set({ syncError: message }));
  },

  addSignature: async (deliveryId, signatureData) => {
    const now = new Date().toISOString();
    const updated = get().deliveries.map((delivery) =>
      delivery.id === deliveryId
        ? normalizeDelivery({ ...delivery, signatureData, signedAt: now, status: 'signed' })
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
    const initial = mockDeliveries.map((delivery) => normalizeDelivery(delivery));
    set({ deliveries: initial });
    await persistDeliveries(initial);
    pushDeliveriesInBackground(initial, (message) => set({ syncError: message }));
  },

  getDeliveriesForDriver: (driverId) => {
    return get().deliveries
      .map((delivery) => normalizeDelivery(delivery))
      .filter((delivery) => delivery.assignedDriverId === driverId);
  },
}));
