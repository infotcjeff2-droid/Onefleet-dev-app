import { create } from 'zustand';
import { DeliveryOrder, DeliveryStatus } from '@/constants/mockData';
import { mockDeliveries } from '@/constants/mockData';

interface DeliveryState {
  deliveries: DeliveryOrder[];
  addOrder: (order: Omit<DeliveryOrder, 'id' | 'createdAt'>) => void;
  assignDriver: (deliveryId: string, driverId: string, driverName: string) => void;
  updateStatus: (deliveryId: string, status: DeliveryStatus) => void;
  addSignature: (deliveryId: string, signatureData: string) => void;
  resetDeliveries: () => void;
  getDeliveriesForDriver: (driverId: string) => DeliveryOrder[];
}

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  deliveries: mockDeliveries,

  addOrder: (order) => {
    const now = new Date();
    const id = `del${Date.now()}`;
    const orderNo = `WO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(get().deliveries.length + 1).padStart(3, '0')}`;
    const newOrder: DeliveryOrder = {
      ...order,
      id,
      orderNo,
      createdAt: now.toISOString(),
    };
    set((state) => ({
      deliveries: [newOrder, ...state.deliveries],
    }));
  },

  assignDriver: (deliveryId: string, driverId: string, driverName: string) => {
    set((state) => ({
      deliveries: state.deliveries.map((d) =>
        d.id === deliveryId
          ? { ...d, assignedDriverId: driverId, assignedDriverName: driverName, status: 'assigned' as DeliveryStatus }
          : d
      ),
    }));
  },

  updateStatus: (deliveryId: string, status: DeliveryStatus) => {
    set((state) => ({
      deliveries: state.deliveries.map((d) =>
        d.id === deliveryId ? { ...d, status } : d
      ),
    }));
  },

  addSignature: (deliveryId: string, signatureData: string) => {
    const now = new Date().toISOString();
    set((state) => ({
      deliveries: state.deliveries.map((d) =>
        d.id === deliveryId
          ? { ...d, signatureData, signedAt: now, status: 'signed' as DeliveryStatus }
          : d
      ),
    }));
  },

  resetDeliveries: () => {
    set({ deliveries: mockDeliveries });
  },

  getDeliveriesForDriver: (driverId: string) => {
    return get().deliveries.filter((d) => d.assignedDriverId === driverId);
  },
}));
