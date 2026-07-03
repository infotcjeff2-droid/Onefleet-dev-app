import { create } from 'zustand';
import {
  Warehouse,
  InventoryItem,
  WarehouseStock,
  Truck,
  TruckStatus,
  ReplenishmentOrder,
  ReplenishmentStatus,
  StockAlert,
  DispatchOrder,
  DeliveryOrder,
} from '@/types';
import { storage } from '@/utils/storage';
import { getWarehouseCoords } from '@/utils/warehouseCoords';

const STORAGE_KEYS = {
  warehouses: 'inventories_warehouses',
  items: 'inventories_items',
  stocks: 'inventories_stocks',
  trucks: 'inventories_trucks',
  replenishment: 'inventories_replenishment',
  alerts: 'inventories_alerts',
  dispatches: 'inventories_dispatches',
};

// ============ Helper Functions ============
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function nearestNeighborRoute(points: { id: string; lat: number; lng: number }[], startLat: number, startLng: number): string[] {
  if (points.length === 0) return [];
  
  const route: string[] = [];
  const remaining = [...points];
  let currentLat = startLat;
  let currentLng = startLng;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineDistance(currentLat, currentLng, remaining[i].lat, remaining[i].lng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0];
    route.push(nearest.id);
    currentLat = nearest.lat;
    currentLng = nearest.lng;
  }

  return route;
}

// ============ Store Interface ============
interface InventoryState {
  // Data
  warehouses: Warehouse[];
  items: InventoryItem[];
  warehouseStocks: WarehouseStock[];
  trucks: Truck[];
  replenishmentOrders: ReplenishmentOrder[];
  stockAlerts: StockAlert[];
  dispatchOrders: DispatchOrder[];

  // Loading states
  isLoading: boolean;

  // Warehouse actions
  loadWarehouses: () => Promise<void>;
  addWarehouse: (warehouse: Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Warehouse>;
  updateWarehouse: (id: string, updates: Partial<Warehouse>) => Promise<void>;
  deleteWarehouse: (id: string) => Promise<void>;
  getWarehouseById: (id: string) => Warehouse | undefined;

  // Inventory Item actions
  loadItems: () => Promise<void>;
  addItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<InventoryItem>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  getItemById: (id: string) => InventoryItem | undefined;

  // Stock actions
  loadStocks: () => Promise<void>;
  getStockAtWarehouse: (warehouseId: string, itemId: string) => number;
  getTotalStock: (itemId: string) => number;
  deductStock: (warehouseId: string, itemId: string, quantity: number) => Promise<boolean>;
  addStock: (warehouseId: string, itemId: string, quantity: number) => Promise<void>;
  transferStock: (fromWarehouseId: string, toWarehouseId: string, itemId: string, quantity: number) => Promise<boolean>;

  // Truck actions
  loadTrucks: () => Promise<void>;
  addTruck: (truck: Omit<Truck, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Truck>;
  updateTruck: (id: string, updates: Partial<Truck>) => Promise<void>;
  deleteTruck: (id: string) => Promise<void>;
  getAvailableTrucks: () => Truck[];
  assignTruckToDriver: (truckId: string, driverId: string, driverName: string) => Promise<void>;

  // Stock Alert actions
  checkStockAvailability: (itemId: string, requestedQuantity: number, warehouseId?: string) => StockAlert | null;
  checkAllStocksForDelivery: (delivery: DeliveryOrder, warehouseId: string) => StockAlert[];
  resolveAlert: (alertId: string) => Promise<void>;
  loadAlerts: () => Promise<void>;

  // Replenishment actions
  loadReplenishment: () => Promise<void>;
  createReplenishmentOrder: (alert: StockAlert) => Promise<ReplenishmentOrder>;
  updateReplenishmentStatus: (id: string, status: ReplenishmentStatus) => Promise<void>;
  autoCreateReplenishmentForDeficit: (deficitQuantity: number, item: InventoryItem, warehouse: Warehouse) => Promise<ReplenishmentOrder>;

  // AI Dispatch Logic
  loadDispatches: () => Promise<void>;
  autoAllocateDeliveries: (deliveries: DeliveryOrder[]) => Promise<{
    dispatches: DispatchOrder[];
    alerts: StockAlert[];
    unassigned: DeliveryOrder[];
  }>;
  createDispatchOrder: (dispatch: Omit<DispatchOrder, 'id' | 'createdAt'>) => Promise<DispatchOrder>;
  updateDispatchStatus: (id: string, status: DispatchOrder['status']) => Promise<void>;

  // Bulk operations
  loadAll: () => Promise<void>;
  resetAll: () => Promise<void>;
  initWithDummyData: () => Promise<void>;
}

// ============ Persistence Functions ============
async function persistWarehouses(warehouses: Warehouse[]) {
  await storage.setItem(STORAGE_KEYS.warehouses, JSON.stringify(warehouses));
}

async function persistItems(items: InventoryItem[]) {
  await storage.setItem(STORAGE_KEYS.items, JSON.stringify(items));
}

async function persistStocks(stocks: WarehouseStock[]) {
  await storage.setItem(STORAGE_KEYS.stocks, JSON.stringify(stocks));
}

async function persistTrucks(trucks: Truck[]) {
  await storage.setItem(STORAGE_KEYS.trucks, JSON.stringify(trucks));
}

async function persistReplenishment(orders: ReplenishmentOrder[]) {
  await storage.setItem(STORAGE_KEYS.replenishment, JSON.stringify(orders));
}

async function persistAlerts(alerts: StockAlert[]) {
  await storage.setItem(STORAGE_KEYS.alerts, JSON.stringify(alerts));
}

async function persistDispatches(dispatches: DispatchOrder[]) {
  await storage.setItem(STORAGE_KEYS.dispatches, JSON.stringify(dispatches));
}

// ============ Store Implementation ============
export const useInventoryStore = create<InventoryState>((set, get) => ({
  // Initial state
  warehouses: [],
  items: [],
  warehouseStocks: [],
  trucks: [],
  replenishmentOrders: [],
  stockAlerts: [],
  dispatchOrders: [],
  isLoading: true,

  // ============ Warehouse Actions ============
  loadWarehouses: async () => {
    try {
      const stored = await storage.getItem(STORAGE_KEYS.warehouses);
      if (stored) {
        set({ warehouses: JSON.parse(stored) });
      }
    } catch {
      set({ warehouses: [] });
    }
  },

  addWarehouse: async (data) => {
    const now = new Date().toISOString();
    // 從地址產生內部座標（用於距離演算法，不暴露給使用者）
    const { addressToCoords } = await import('@/utils/warehouseCoords');
    const newWarehouse: Warehouse = {
      ...data,
      id: data.id || `wh-${Date.now()}`,
      // 若已有 internalCoords（mock 載入）則沿用，否則由地址生成
      internalCoords:
        data.internalCoords ?? addressToCoords(data.address ?? ''),
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    const updated = [...get().warehouses, newWarehouse];
    set({ warehouses: updated });
    await persistWarehouses(updated);
    return newWarehouse;
  },

  updateWarehouse: async (id, updates) => {
    const { addressToCoords } = await import('@/utils/warehouseCoords');
    const updated = get().warehouses.map((wh) => {
      const merged = { ...wh, ...updates, updatedAt: new Date().toISOString() };
      // 若地址變更，重新計算內部座標
      if (updates.address && updates.address !== wh.address) {
        merged.internalCoords = addressToCoords(merged.address);
      }
      return merged;
    });
    set({ warehouses: updated });
    await persistWarehouses(updated);
  },

  deleteWarehouse: async (id) => {
    const updated = get().warehouses.filter((wh) => wh.id !== id);
    set({ warehouses: updated });
    await persistWarehouses(updated);
  },

  getWarehouseById: (id) => get().warehouses.find((wh) => wh.id === id),

  // ============ Inventory Item Actions ============
  loadItems: async () => {
    try {
      const stored = await storage.getItem(STORAGE_KEYS.items);
      if (stored) {
        set({ items: JSON.parse(stored) });
      }
    } catch {
      set({ items: [] });
    }
  },

  addItem: async (data) => {
    const now = new Date().toISOString();
    // 若呼叫端有提供 id（mock 載入情境），沿用；否則自動生成
    const newItem: InventoryItem = {
      ...data,
      id: data.id || `item-${Date.now()}`,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    const updated = [...get().items, newItem];
    set({ items: updated });
    await persistItems(updated);
    console.log(`[addItem] item saved: id=${newItem.id}, name=${newItem.name}`);
    return newItem;
  },

  updateItem: async (id, updates) => {
    const updated = get().items.map((item) =>
      item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
    );
    set({ items: updated });
    await persistItems(updated);
  },

  deleteItem: async (id) => {
    const state = get();
    const exists = state.items.some((item) => item.id === id);
    if (!exists) return;
    const items = state.items.filter((item) => item.id !== id);
    // 連帶清掉所有與該物品相關的記錄，避免孤兒資料
    const warehouseStocks = state.warehouseStocks.filter((s) => s.itemId !== id);
    const stockAlerts = state.stockAlerts.filter((a) => a.itemId !== id);
    const replenishmentOrders = state.replenishmentOrders.filter(
      (r) => r.itemId !== id,
    );
    const dispatchOrders: DispatchOrder[] = state.dispatchOrders
      .map((d) => {
        const assignedItems = (d.assignedItems ?? []).filter(
          (ai) => ai.itemId !== id,
        );
        return { ...d, assignedItems };
      })
      .filter((d) => (d.assignedItems?.length ?? 0) > 0);
    set({ items, warehouseStocks, stockAlerts, replenishmentOrders, dispatchOrders });
    await Promise.all([
      persistItems(items),
      persistStocks(warehouseStocks),
      persistAlerts(stockAlerts),
      persistReplenishment(replenishmentOrders),
      persistDispatches(dispatchOrders),
    ]);
  },

  getItemById: (id) => get().items.find((item) => item.id === id),

  // ============ Stock Actions ============
  loadStocks: async () => {
    try {
      const stored = await storage.getItem(STORAGE_KEYS.stocks);
      if (stored) {
        set({ warehouseStocks: JSON.parse(stored) });
      }
    } catch {
      set({ warehouseStocks: [] });
    }
  },

  getStockAtWarehouse: (warehouseId, itemId) => {
    const stock = get().warehouseStocks.find(
      (s) => s.warehouseId === warehouseId && s.itemId === itemId
    );
    return stock?.quantity ?? 0;
  },

  getTotalStock: (itemId) => {
    return get().warehouseStocks
      .filter((s) => s.itemId === itemId)
      .reduce((sum, s) => sum + s.quantity, 0);
  },

  deductStock: async (warehouseId, itemId, quantity) => {
    const stocks = get().warehouseStocks;
    const stockIndex = stocks.findIndex(
      (s) => s.warehouseId === warehouseId && s.itemId === itemId
    );

    if (stockIndex === -1) return false;

    const currentStock = stocks[stockIndex];
    if (currentStock.quantity < quantity) return false;

    const updated = [...stocks];
    updated[stockIndex] = {
      ...currentStock,
      quantity: currentStock.quantity - quantity,
      updatedAt: new Date().toISOString(),
    };

    set({ warehouseStocks: updated });
    await persistStocks(updated);
    return true;
  },

  addStock: async (warehouseId, itemId, quantity) => {
    const stocks = get().warehouseStocks;
    const existingIndex = stocks.findIndex(
      (s) => s.warehouseId === warehouseId && s.itemId === itemId
    );

    if (existingIndex >= 0) {
      const updated = [...stocks];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + quantity,
        updatedAt: new Date().toISOString(),
      };
      set({ warehouseStocks: updated });
      await persistStocks(updated);
    } else {
      const newStock: WarehouseStock = {
        id: `stock-${Date.now()}`,
        warehouseId,
        itemId,
        quantity,
        updatedAt: new Date().toISOString(),
      };
      const updated = [...stocks, newStock];
      set({ warehouseStocks: updated });
      await persistStocks(updated);
      console.log(`[addStock] new stock added: wh=${warehouseId}, item=${itemId}, qty=${quantity}`);
    }
  },

  transferStock: async (fromWarehouseId, toWarehouseId, itemId, quantity) => {
    const deductResult = await get().deductStock(fromWarehouseId, itemId, quantity);
    if (!deductResult) return false;
    await get().addStock(toWarehouseId, itemId, quantity);
    return true;
  },

  // ============ Truck Actions ============
  loadTrucks: async () => {
    try {
      const stored = await storage.getItem(STORAGE_KEYS.trucks);
      if (stored) {
        set({ trucks: JSON.parse(stored) });
      }
    } catch {
      set({ trucks: [] });
    }
  },

  addTruck: async (data) => {
    const now = new Date().toISOString();
    const newTruck: Truck = {
      ...data,
      id: `truck-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [...get().trucks, newTruck];
    set({ trucks: updated });
    await persistTrucks(updated);
    return newTruck;
  },

  updateTruck: async (id, updates) => {
    const updated = get().trucks.map((truck) =>
      truck.id === id ? { ...truck, ...updates, updatedAt: new Date().toISOString() } : truck
    );
    set({ trucks: updated });
    await persistTrucks(updated);
  },

  deleteTruck: async (id) => {
    const updated = get().trucks.filter((truck) => truck.id !== id);
    set({ trucks: updated });
    await persistTrucks(updated);
  },

  getAvailableTrucks: () => {
    return get().trucks.filter((truck) => truck.status === 'available');
  },

  assignTruckToDriver: async (truckId, driverId, driverName) => {
    await get().updateTruck(truckId, {
      assignedDriverId: driverId,
      assignedDriverName: driverName,
      status: 'busy',
    });
  },

  // ============ Stock Alert Actions ============
  loadAlerts: async () => {
    try {
      const stored = await storage.getItem(STORAGE_KEYS.alerts);
      if (stored) {
        set({ stockAlerts: JSON.parse(stored) });
      }
    } catch {
      set({ stockAlerts: [] });
    }
  },

  checkStockAvailability: (itemId, requestedQuantity, warehouseId) => {
    const item = get().getItemById(itemId);
    const warehouse = warehouseId ? get().getWarehouseById(warehouseId) : null;
    
    if (!item) return null;

    const availableQty = warehouseId 
      ? get().getStockAtWarehouse(warehouseId, itemId)
      : get().getTotalStock(itemId);

    if (availableQty < requestedQuantity) {
      const alert: StockAlert = {
        id: `alert-${Date.now()}`,
        itemId,
        itemName: item.name,
        warehouseId: warehouseId ?? 'all',
        warehouseName: warehouse?.name ?? '所有倉庫',
        requestedQuantity,
        availableQuantity: availableQty,
        deficitQuantity: requestedQuantity - availableQty,
        deliveryId: '',
        isResolved: false,
        createdAt: new Date().toISOString(),
      };
      return alert;
    }

    return null;
  },

  checkAllStocksForDelivery: (delivery, warehouseId) => {
    const alerts: StockAlert[] = [];
    // This is a simplified check - in real app, you'd parse cargo items from delivery
    // For now, we assume delivery.cargoWeight represents total weight
    return alerts;
  },

  resolveAlert: async (alertId) => {
    const updated = get().stockAlerts.map((alert) =>
      alert.id === alertId ? { ...alert, isResolved: true } : alert
    );
    set({ stockAlerts: updated });
    await persistAlerts(updated);
  },

  // ============ Replenishment Actions ============
  loadReplenishment: async () => {
    try {
      const stored = await storage.getItem(STORAGE_KEYS.replenishment);
      if (stored) {
        set({ replenishmentOrders: JSON.parse(stored) });
      }
    } catch {
      set({ replenishmentOrders: [] });
    }
  },

  createReplenishmentOrder: async (alert) => {
    const order: ReplenishmentOrder = {
      id: `rep-${Date.now()}`,
      itemId: alert.itemId,
      itemName: alert.itemName,
      warehouseId: alert.warehouseId,
      warehouseName: alert.warehouseName,
      deficitQuantity: alert.deficitQuantity,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [...get().replenishmentOrders, order];
    set({ replenishmentOrders: updated });
    await persistReplenishment(updated);
    return order;
  },

  updateReplenishmentStatus: async (id, status) => {
    const updated = get().replenishmentOrders.map((order) =>
      order.id === id ? { ...order, status, updatedAt: new Date().toISOString() } : order
    );
    set({ replenishmentOrders: updated });
    await persistReplenishment(updated);
  },

  autoCreateReplenishmentForDeficit: async (deficitQuantity, item, warehouse) => {
    const order: ReplenishmentOrder = {
      id: `rep-${Date.now()}`,
      itemId: item.id,
      itemName: item.name,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      deficitQuantity,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [...get().replenishmentOrders, order];
    set({ replenishmentOrders: updated });
    await persistReplenishment(updated);
    return order;
  },

  // ============ AI Dispatch Logic ============
  loadDispatches: async () => {
    try {
      const stored = await storage.getItem(STORAGE_KEYS.dispatches);
      if (stored) {
        set({ dispatchOrders: JSON.parse(stored) });
      }
    } catch {
      set({ dispatchOrders: [] });
    }
  },

  autoAllocateDeliveries: (deliveries) => {
    const { warehouses, trucks, items, warehouseStocks } = get();
    const availableTrucks = trucks.filter((t) => t.status === 'available');
    const pendingDeliveries = deliveries.filter((d) => d.status === 'pending' && !d.assignedDriverId);

    if (availableTrucks.length === 0) {
      return {
        dispatches: [],
        alerts: [],
        unassigned: pendingDeliveries,
      };
    }

    const dispatches: DispatchOrder[] = [];
    const alerts: StockAlert[] = [];
    const unassigned: DeliveryOrder[] = [];

    // Group deliveries by nearest warehouse
    const deliveriesByWarehouse = new Map<string, DeliveryOrder[]>();

    // (getWarehouseCoords is imported statically at the top of the file)

    for (const delivery of pendingDeliveries) {
      // Find nearest warehouse (simplified - would need actual coordinates from address)
      let nearestWarehouse: Warehouse | null = null;
      let minDistance = Infinity;

      for (const warehouse of warehouses) {
        // 使用內部座標估算距離（地址產生的合成座標）
        const whCoords = getWarehouseCoords(warehouse);
        const distance = 0; // Placeholder - 距離為 0 表示所有倉庫同距離，由下個規則排序
        void whCoords; // reserved for future use
        if (distance < minDistance) {
          minDistance = distance;
          nearestWarehouse = warehouse;
        }
      }

      if (nearestWarehouse) {
        const existing = deliveriesByWarehouse.get(nearestWarehouse.id) ?? [];
        deliveriesByWarehouse.set(nearestWarehouse.id, [...existing, delivery]);
      } else {
        unassigned.push(delivery);
      }
    }

    // Assign deliveries to trucks based on capacity
    let truckIndex = 0;
    for (const [warehouseId, deliveryGroup] of deliveriesByWarehouse) {
      const warehouse = warehouses.find((w) => w.id === warehouseId);
      if (!warehouse) continue;

      // Calculate total weight for this group
      const totalWeight = deliveryGroup.reduce((sum, d) => sum + d.cargoWeight, 0);

      // Find available truck with enough capacity
      let assignedTruck: Truck | null = null;
      for (let i = 0; i < availableTrucks.length; i++) {
        const truck = availableTrucks[i];
        const remainingCapacity = truck.maxWeightCapacity - truck.currentLoad;
        if (remainingCapacity >= totalWeight) {
          assignedTruck = truck;
          availableTrucks.splice(i, 1);
          break;
        }
      }

      if (!assignedTruck) {
        unassigned.push(...deliveryGroup);
        continue;
      }

      // Optimize route using nearest neighbor
      const deliveryPoints = deliveryGroup.map((d) => ({
        id: d.id,
        lat: 0, // Would be geocoded in real app
        lng: 0,
      }));

      const warehouseCoords = getWarehouseCoords(warehouse);
      const routeSequence = nearestNeighborRoute(
        deliveryPoints,
        warehouseCoords.lat,
        warehouseCoords.lng
      );

      // Create dispatch order
      const dispatch: DispatchOrder = {
        id: `dispatch-${Date.now()}-${dispatches.length}`,
        deliveryId: deliveryGroup.map((d) => d.id).join(','),
        truckId: assignedTruck.id,
        driverId: assignedTruck.assignedDriverId ?? '',
        driverName: assignedTruck.assignedDriverName ?? '',
        warehouseId,
        assignedItems: [], // Would be populated from delivery cargo
        totalWeight,
        routeSequence,
        estimatedDistance: routeSequence.length * 5, // ~5km per stop average
        estimatedDuration: routeSequence.length * 15, // ~15 min per stop
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      dispatches.push(dispatch);
    }

    return { dispatches, alerts, unassigned };
  },

  createDispatchOrder: async (data) => {
    const dispatch: DispatchOrder = {
      ...data,
      id: `dispatch-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    const updated = [...get().dispatchOrders, dispatch];
    set({ dispatchOrders: updated });
    await persistDispatches(updated);
    return dispatch;
  },

  updateDispatchStatus: async (id, status) => {
    const updated = get().dispatchOrders.map((d) =>
      d.id === id ? { ...d, status } : d
    );
    set({ dispatchOrders: updated });
    await persistDispatches(updated);
  },

  // ============ Bulk Operations ============
  loadAll: async () => {
    set({ isLoading: true });
    await Promise.all([
      get().loadWarehouses(),
      get().loadItems(),
      get().loadStocks(),
      get().loadTrucks(),
      get().loadReplenishment(),
      get().loadAlerts(),
      get().loadDispatches(),
    ]);
    set({ isLoading: false });
  },

  resetAll: async () => {
    set({
      warehouses: [],
      items: [],
      warehouseStocks: [],
      trucks: [],
      replenishmentOrders: [],
      stockAlerts: [],
      dispatchOrders: [],
    });
    await Promise.all([
      persistWarehouses([]),
      persistItems([]),
      persistStocks([]),
      persistTrucks([]),
      persistReplenishment([]),
      persistAlerts([]),
      persistDispatches([]),
    ]);
  },

  // ============ Initialize with Dummy Data ============
  initWithDummyData: async () => {
    const {
      DUMMY_WAREHOUSES,
      DUMMY_ITEMS,
      DUMMY_WAREHOUSE_STOCKS,
      DUMMY_REPLENISHMENT_ORDERS,
      DUMMY_STOCK_ALERTS,
    } = await import('@/constants/mockInventoryData');

    // 保留現有卡車資料（車隊管理由用戶自訂，不使用 mock 卡車）
    const existingTrucks = get().trucks;

    // 清除非卡車的所有資料（倉庫、物品、庫存、補貨、警示）
    set({
      warehouses: [],
      items: [],
      warehouseStocks: [],
      replenishmentOrders: [],
      stockAlerts: [],
      dispatchOrders: [],
    });
    await Promise.all([
      persistWarehouses([]),
      persistItems([]),
      persistStocks([]),
      persistReplenishment([]),
      persistAlerts([]),
      persistDispatches([]),
    ]);

    // 確保卡車資料保留（不被清空）
    if (existingTrucks.length > 0) {
      set({ trucks: existingTrucks });
      await persistTrucks(existingTrucks);
    } else {
      set({ trucks: [] });
      await persistTrucks([]);
    }

    // 載入倉庫
    for (const warehouse of DUMMY_WAREHOUSES) {
      await get().addWarehouse(warehouse);
    }

    // 載入物品
    for (const item of DUMMY_ITEMS) {
      await get().addItem(item);
    }

    // 載入庫存
    for (const stock of DUMMY_WAREHOUSE_STOCKS) {
      await get().addStock(stock.warehouseId, stock.itemId, stock.quantity);
    }

    // 載入補貨訂單
    for (const order of DUMMY_REPLENISHMENT_ORDERS) {
      await get().createReplenishmentOrder({
        id: order.id,
        itemId: order.itemId,
        itemName: order.itemName,
        warehouseId: order.warehouseId,
        warehouseName: order.warehouseName,
        deficitQuantity: order.deficitQuantity,
        status: order.status,
        deliveryId: '',
        isResolved: false,
        createdAt: order.createdAt,
      });
    }

    // 載入庫存警示
    set({ stockAlerts: DUMMY_STOCK_ALERTS });
    await persistAlerts(DUMMY_STOCK_ALERTS);

    console.log(`✅ 假資料初始化完成（保留 ${existingTrucks.length} 部車輛資料）`);
  },
}));
