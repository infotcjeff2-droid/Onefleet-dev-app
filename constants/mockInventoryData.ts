import { Warehouse, InventoryItem, Truck, ReplenishmentOrder } from '@/types';

// ============ 倉庫假資料 (4個) - 香港地區 ============
import { addressToCoords } from '@/utils/warehouseCoords';

export const DUMMY_WAREHOUSES: Warehouse[] = [
  {
    id: 'wh-hk-kln',
    name: '九龍配送中心',
    address: '九龍觀塘巧明街100號萬兆光大廈',
    imageUrl: 'https://images.unsplash.com/photo-1553413077-190dd305871c?w=800',
    totalArea: 2000,
    storageCapacity: 1500,
    currentStockLevel: 530,
    manager: '陳志明',
    phone: '+852-2345-6789',
    notes: '主要營運倉庫，鄰近觀塘工業區',
    internalCoords: addressToCoords('九龍觀塘巧明街100號萬兆光大廈'),
    createdAt: '2025-01-15T08:00:00.000Z',
    updatedAt: '2025-01-15T08:00:00.000Z',
  },
  {
    id: 'wh-hk-nt',
    name: '新界倉庫',
    address: '新界葵涌貨櫃碼頭道88號永基貨倉大廈',
    imageUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800',
    totalArea: 1500,
    storageCapacity: 1000,
    currentStockLevel: 295,
    manager: '李偉強',
    phone: '+852-2613-1234',
    notes: '葵涌物流樞紐，支援全港配送',
    internalCoords: addressToCoords('新界葵涌貨櫃碼頭道88號永基貨倉大廈'),
    createdAt: '2025-01-20T09:00:00.000Z',
    updatedAt: '2025-01-20T09:00:00.000Z',
  },
  {
    id: 'wh-hk-hk',
    name: '香港島倉庫',
    address: '香港仔黃竹坑道99號南濤閣工業大樓',
    imageUrl: 'https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=800',
    totalArea: 3000,
    storageCapacity: 2000,
    currentStockLevel: 295,
    manager: '王大衛',
    phone: '+852-2552-5555',
    notes: '港島區最大倉儲中心',
    internalCoords: addressToCoords('香港仔黃竹坑道99號南濤閣工業大樓'),
    createdAt: '2025-02-01T10:00:00.000Z',
    updatedAt: '2025-02-01T10:00:00.000Z',
  },
  {
    id: 'wh-hk-iom',
    name: '機場物流倉庫',
    address: '大嶼山香港國際機場翔天路1號航空物流中心',
    imageUrl: 'https://images.unsplash.com/photo-1601598851547-4302969d0614?w=800',
    totalArea: 1200,
    storageCapacity: 800,
    currentStockLevel: 185,
    manager: '張美麗',
    phone: '+852-2183-7788',
    notes: '國際物流及空運貨物處理',
    internalCoords: addressToCoords('大嶼山香港國際機場翔天路1號航空物流中心'),
    createdAt: '2025-02-15T11:00:00.000Z',
    updatedAt: '2025-02-15T11:00:00.000Z',
  },
];

// 兼容舊邏輯（如果 store 之內仍讀取 location）
export function getLegacyLocation(w: Warehouse) {
  return {
    lat: w.internalCoords?.lat ?? 0,
    lng: w.internalCoords?.lng ?? 0,
    address: w.address,
  };
}

// ============ 庫存物品假資料 ============
export const DUMMY_ITEMS: InventoryItem[] = [
  {
    id: 'item-electronics-a',
    name: '電子元件 A型',
    unitWeight: 0.5, // kg
    totalQuantity: 150,
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400',
    defaultWarehouseId: 'wh-hk-kln',
    sku: 'EC-A-001',
    category: '電子零件',
    createdAt: '2025-01-15T08:30:00.000Z',
    updatedAt: '2025-06-20T14:30:00.000Z',
  },
  {
    id: 'item-electronics-b',
    name: '電子元件 B型',
    unitWeight: 0.8,
    totalQuantity: 80,
    imageUrl: 'https://images.unsplash.com/photo-1551703599-6b3e8379aa8d?w=400',
    defaultWarehouseId: 'wh-hk-kln',
    sku: 'EC-B-002',
    category: '電子零件',
    createdAt: '2025-01-15T08:35:00.000Z',
    updatedAt: '2025-06-18T10:00:00.000Z',
  },
  {
    id: 'item-packaging-box-s',
    name: '包裝箱 (小)',
    unitWeight: 0.2,
    totalQuantity: 500,
    imageUrl: 'https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=400',
    defaultWarehouseId: 'wh-hk-kln',
    sku: 'PKG-S-001',
    category: '包裝材料',
    createdAt: '2025-01-20T09:15:00.000Z',
    updatedAt: '2025-06-15T16:00:00.000Z',
  },
  {
    id: 'item-packaging-box-m',
    name: '包裝箱 (中)',
    unitWeight: 0.4,
    totalQuantity: 300,
    imageUrl: 'https://images.unsplash.com/photo-1530989241795-cecba27c7011?w=400',
    defaultWarehouseId: 'wh-hk-hk',
    sku: 'PKG-M-002',
    category: '包裝材料',
    createdAt: '2025-01-20T09:20:00.000Z',
    updatedAt: '2025-06-10T11:00:00.000Z',
  },
  {
    id: 'item-packaging-box-l',
    name: '包裝箱 (大)',
    unitWeight: 0.6,
    totalQuantity: 120,
    imageUrl: 'https://images.unsplash.com/photo-1530989241795-cecba27c7011?w=400',
    defaultWarehouseId: 'wh-hk-nt',
    sku: 'PKG-L-003',
    category: '包裝材料',
    createdAt: '2025-01-20T09:25:00.000Z',
    updatedAt: '2025-06-05T09:00:00.000Z',
  },
  {
    id: 'item-food-frozen',
    name: '急凍食品原料',
    unitWeight: 5.0,
    totalQuantity: 45,
    imageUrl: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc7f1?w=400',
    defaultWarehouseId: 'wh-hk-hk',
    sku: 'FD-FRZ-001',
    category: '食品',
    createdAt: '2025-02-01T10:30:00.000Z',
    updatedAt: '2025-06-22T08:00:00.000Z',
  },
  {
    id: 'item-textile-fabric',
    name: '紡織布料',
    unitWeight: 2.5,
    totalQuantity: 60,
    imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
    defaultWarehouseId: 'wh-hk-iom',
    sku: 'TX-FAB-001',
    category: '紡織品',
    createdAt: '2025-02-15T11:30:00.000Z',
    updatedAt: '2025-06-01T15:00:00.000Z',
  },
  {
    id: 'item-hardware-screw',
    name: '螺絲零件組',
    unitWeight: 1.2,
    totalQuantity: 200,
    imageUrl: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=400',
    defaultWarehouseId: 'wh-hk-iom',
    sku: 'HW-SCR-001',
    category: '五金零件',
    createdAt: '2025-02-15T11:35:00.000Z',
    updatedAt: '2025-06-25T10:00:00.000Z',
  },
];

// ============ 倉庫庫存假資料 ============
// 每個倉庫的庫存分布
export const DUMMY_WAREHOUSE_STOCKS = [
  // 九龍配送中心
  { id: 'stock-1', warehouseId: 'wh-hk-kln', itemId: 'item-electronics-a', quantity: 60, updatedAt: '2025-06-20T14:30:00.000Z' },
  { id: 'stock-2', warehouseId: 'wh-hk-kln', itemId: 'item-electronics-b', quantity: 40, updatedAt: '2025-06-18T10:00:00.000Z' },
  { id: 'stock-3', warehouseId: 'wh-hk-kln', itemId: 'item-packaging-box-s', quantity: 200, updatedAt: '2025-06-15T16:00:00.000Z' },
  { id: 'stock-4', warehouseId: 'wh-hk-kln', itemId: 'item-packaging-box-m', quantity: 150, updatedAt: '2025-06-10T11:00:00.000Z' },
  { id: 'stock-5', warehouseId: 'wh-hk-kln', itemId: 'item-hardware-screw', quantity: 80, updatedAt: '2025-06-25T10:00:00.000Z' },

  // 新界倉庫
  { id: 'stock-6', warehouseId: 'wh-hk-nt', itemId: 'item-electronics-a', quantity: 50, updatedAt: '2025-06-20T14:30:00.000Z' },
  { id: 'stock-7', warehouseId: 'wh-hk-nt', itemId: 'item-electronics-b', quantity: 25, updatedAt: '2025-06-18T10:00:00.000Z' },
  { id: 'stock-8', warehouseId: 'wh-hk-nt', itemId: 'item-packaging-box-s', quantity: 150, updatedAt: '2025-06-15T16:00:00.000Z' },
  { id: 'stock-9', warehouseId: 'wh-hk-nt', itemId: 'item-packaging-box-l', quantity: 70, updatedAt: '2025-06-05T09:00:00.000Z' },

  // 香港島倉庫
  { id: 'stock-10', warehouseId: 'wh-hk-hk', itemId: 'item-electronics-a', quantity: 40, updatedAt: '2025-06-20T14:30:00.000Z' },
  { id: 'stock-11', warehouseId: 'wh-hk-hk', itemId: 'item-food-frozen', quantity: 45, updatedAt: '2025-06-22T08:00:00.000Z' },
  { id: 'stock-12', warehouseId: 'wh-hk-hk', itemId: 'item-packaging-box-m', quantity: 150, updatedAt: '2025-06-10T11:00:00.000Z' },
  { id: 'stock-13', warehouseId: 'wh-hk-hk', itemId: 'item-textile-fabric', quantity: 60, updatedAt: '2025-06-01T15:00:00.000Z' },

  // 機場物流倉庫
  { id: 'stock-14', warehouseId: 'wh-hk-iom', itemId: 'item-electronics-b', quantity: 15, updatedAt: '2025-06-18T10:00:00.000Z' }, // 庫存不足！
  { id: 'stock-15', warehouseId: 'wh-hk-iom', itemId: 'item-packaging-box-l', quantity: 50, updatedAt: '2025-06-05T09:00:00.000Z' },
  { id: 'stock-16', warehouseId: 'wh-hk-iom', itemId: 'item-textile-fabric', quantity: 0, updatedAt: '2025-06-01T15:00:00.000Z' }, // 庫存不足！
  { id: 'stock-17', warehouseId: 'wh-hk-iom', itemId: 'item-hardware-screw', quantity: 120, updatedAt: '2025-06-25T10:00:00.000Z' },
];

// ============ 車隊假資料 ============
export const DUMMY_TRUCKS: Truck[] = [
  {
    id: 'truck-001',
    plateNumber: 'CA 1234',
    maxWeightCapacity: 5000,
    currentLoad: 0,
    status: 'available',
    createdAt: '2025-01-10T08:00:00.000Z',
    updatedAt: '2025-06-26T08:00:00.000Z',
  },
  {
    id: 'truck-002',
    plateNumber: 'XX 5678',
    maxWeightCapacity: 3000,
    currentLoad: 1500,
    status: 'busy',
    assignedDriverId: 'd-001',
    assignedDriverName: '王小明',
    createdAt: '2025-01-12T09:00:00.000Z',
    updatedAt: '2025-06-26T07:30:00.000Z',
  },
  {
    id: 'truck-003',
    plateNumber: 'EV 0001',
    maxWeightCapacity: 8000,
    currentLoad: 0,
    status: 'available',
    createdAt: '2025-02-01T10:00:00.000Z',
    updatedAt: '2025-06-25T18:00:00.000Z',
  },
  {
    id: 'truck-004',
    plateNumber: 'TR 9012',
    maxWeightCapacity: 4000,
    currentLoad: 0,
    status: 'maintenance',
    createdAt: '2025-02-10T11:00:00.000Z',
    updatedAt: '2025-06-24T16:00:00.000Z',
  },
  {
    id: 'truck-005',
    plateNumber: 'SF 3456',
    maxWeightCapacity: 6000,
    currentLoad: 0,
    status: 'available',
    createdAt: '2025-03-01T08:30:00.000Z',
    updatedAt: '2025-06-26T06:00:00.000Z',
  },
];

// ============ 補貨訂單假資料 ============
export const DUMMY_REPLENISHMENT_ORDERS: ReplenishmentOrder[] = [
  {
    id: 'rep-001',
    itemId: 'item-electronics-b',
    itemName: '電子元件 B型',
    warehouseId: 'wh-hk-iom',
    warehouseName: '機場物流倉庫',
    deficitQuantity: 85, // 需要補貨數量
    status: 'pending',
    createdAt: '2025-06-25T14:30:00.000Z',
    updatedAt: '2025-06-25T14:30:00.000Z',
  },
  {
    id: 'rep-002',
    itemId: 'item-textile-fabric',
    itemName: '紡織布料',
    warehouseId: 'wh-hk-iom',
    warehouseName: '機場物流倉庫',
    deficitQuantity: 60, // 需要補貨數量
    status: 'ordered',
    createdAt: '2025-06-20T10:00:00.000Z',
    updatedAt: '2025-06-22T09:00:00.000Z',
  },
  {
    id: 'rep-003',
    itemId: 'item-packaging-box-l',
    itemName: '包裝箱 (大)',
    warehouseId: 'wh-hk-kln',
    warehouseName: '九龍配送中心',
    deficitQuantity: 30,
    status: 'shipped',
    createdAt: '2025-06-18T11:00:00.000Z',
    updatedAt: '2025-06-24T15:00:00.000Z',
  },
  {
    id: 'rep-004',
    itemId: 'item-food-frozen',
    itemName: '急凍食品原料',
    warehouseId: 'wh-hk-hk',
    warehouseName: '香港島倉庫',
    deficitQuantity: 20,
    status: 'received',
    createdAt: '2025-06-10T08:30:00.000Z',
    updatedAt: '2025-06-15T14:00:00.000Z',
  },
];

// ============ 庫存警示假資料（用於測試紅色警示） ============
export const DUMMY_STOCK_ALERTS = [
  {
    id: 'alert-001',
    itemId: 'item-electronics-b',
    itemName: '電子元件 B型',
    warehouseId: 'wh-hk-iom',
    warehouseName: '機場物流倉庫',
    requestedQuantity: 100,
    availableQuantity: 15,
    deficitQuantity: 85,
    deliveryId: '',
    isResolved: false,
    createdAt: '2025-06-25T14:30:00.000Z',
  },
  {
    id: 'alert-002',
    itemId: 'item-textile-fabric',
    itemName: '紡織布料',
    warehouseId: 'wh-hk-iom',
    warehouseName: '機場物流倉庫',
    requestedQuantity: 60,
    availableQuantity: 0,
    deficitQuantity: 60,
    deliveryId: '',
    isResolved: false,
    createdAt: '2025-06-20T10:00:00.000Z',
  },
];

// ============ 批量匯入假資料的函式 ============
export async function loadDummyData(inventoryStore: any) {
  console.log('📦 正在載入假資料...');

  // 載入倉庫
  for (const warehouse of DUMMY_WAREHOUSES) {
    await inventoryStore.addWarehouse(warehouse);
  }
  console.log('✅ 倉庫資料已載入 (4筆)');

  // 載入物品
  for (const item of DUMMY_ITEMS) {
    await inventoryStore.addItem(item);
  }
  console.log('✅ 物品資料已載入 (8筆)');

  // 載入庫存
  for (const stock of DUMMY_WAREHOUSE_STOCKS) {
    await inventoryStore.addStock(stock.warehouseId, stock.itemId, stock.quantity);
  }
  console.log('✅ 庫存資料已載入 (17筆)');

  // 載入車隊
  for (const truck of DUMMY_TRUCKS) {
    const { addTruck } = inventoryStore;
    await addTruck({
      plateNumber: truck.plateNumber,
      maxWeightCapacity: truck.maxWeightCapacity,
      currentLoad: truck.currentLoad,
      status: truck.status,
      assignedDriverId: truck.assignedDriverId,
      assignedDriverName: truck.assignedDriverName,
    });
  }
  console.log('✅ 車隊資料已載入 (5筆)');

  // 載入補貨訂單
  for (const order of DUMMY_REPLENISHMENT_ORDERS) {
    await inventoryStore.createReplenishmentOrder({
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
  console.log('✅ 補貨訂單已載入 (4筆)');

  console.log('🎉 所有假資料載入完成！');
}
