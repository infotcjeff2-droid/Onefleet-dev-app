export type BodyType = 'sedan' | 'suv' | 'truck' | 'van' | 'motorcycle' | 'other';
export type FuelType = 'gasoline' | 'diesel' | 'electric' | 'hybrid';
export type TransmissionType = 'automatic' | 'manual';
export type VehicleStatus = 'active' | 'maintenance' | 'inactive';

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  bodyType: BodyType;
  vin: string;
  plateNumber: string;
  color: string;
  fuelType: FuelType;
  transmission: TransmissionType;
  mileage: number;
  status: VehicleStatus;
  purchaseDate: string;
  insuranceExpiry: string;
  registrationExpiry: string;
  notes: string;
  /** 車輛圖片 URL */
  imageUrl: string;
  createdAt: string;
  /** GPS 808 設備 ID (devIdno)，用於 live tracking */
  devIdno?: string;
  /** 綁定的司機 ID */
  assignedDriverId?: string;
  /** 所屬用戶 ID（用於跨設備同步） */
  userId?: string;
}

export type UserRole = 'admin' | 'company' | 'driver' | 'user';

/** 公司管理相關 - 擴展 User 介面 */
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  avatar?: string;
  /** 密碼（僅在建立/更新時傳遞，不會被持久化儲存） */
  password?: string;
  /** 中文名稱（公司必填） */
  nameZh?: string;
  /** 英文名稱 */
  nameEn?: string;
  /** 地址 */
  address?: string;
  /** 所屬公司 ID（司機角色使用） */
  companyId?: string;
}

/** 駕駛員擴展介面 */
export interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehiclePlate?: string;
  status: 'available' | 'busy' | 'offline';
  avatar?: string;
  assignedVehicleId?: string;
  /** 所屬公司 ID */
  companyId?: string;
}

export type DeliveryStatus = 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'signed' | 'expired';

export interface SignatureStroke {
  x: number;
  y: number;
  id: number;
}

export interface DeliveryPhoto {
  id: string;
  uri: string;
  takenAt: string;
}

export interface DeliveryOrder {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  pickupTime: string;
  dropoffAddress: string;
  dropoffTime?: string;
  cargoDescription: string;
  cargoWeight: number;
  notes?: string;
  status: DeliveryStatus;
  assignedDriverId?: string;
  assignedDriverName?: string;
  signatureData?: string;
  signedAt?: string;
  signatureStrokes?: SignatureStroke[][];
  photos?: DeliveryPhoto[];
  createdAt: string;
  /** 配送的物品列表 */
  cargoItems?: DeliveryCargoItem[];
}

/** 配送物品 - 包含從庫存選擇的物品 */
export interface DeliveryCargoItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitWeight: number; // kg per unit
  totalWeight: number; // quantity * unitWeight
}

export type RootStackParamList = {
  _index: undefined;
  '(auth)': undefined;
  '(tabs)': undefined;
  'vehicle/[id]': { id: string };
  'vehicle/add': undefined;
  'delivery/[id]': { id: string };
  'warehouse/[id]': { id: string };
  'warehouse/add': undefined;
  'dispatch': undefined;
  'replenishment': undefined;
};

// ============ Warehouse & Inventory Types ============
export interface Warehouse {
  id: string;
  name: string;
  /** 完整地址 */
  address: string;
  /** 倉庫圖片 URL 或本地資源 */
  imageUrl?: string;
  /** 倉庫總面積（平方米） */
  totalArea?: number;
  /** 倉庫最大存貨容量（立方米 或 件數） */
  storageCapacity?: number;
  /** 目前存貨量（件數） */
  currentStockLevel?: number;
  /** 倉庫管理員姓名（選填） */
  manager?: string;
  /** 倉庫連絡電話（選填） */
  phone?: string;
  /** 備註 */
  notes?: string;
  /**
   * 內部使用：合成座標，用於距離估算等演算法（如 AI 路徑分配）。
   * 由地址字串雜湊產生，不需使用者手動輸入。
   * @internal
   */
  internalCoords?: { lat: number; lng: number };
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unitWeight: number; // kg per unit
  totalQuantity: number;
  /** 物品圖片 URL 或本地資源 */
  imageUrl?: string;
  /** 所屬倉庫（預設/主要） */
  defaultWarehouseId?: string;
  /** 條碼 / SKU */
  sku?: string;
  /** 物品分類 */
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseStock {
  id: string;
  warehouseId: string;
  itemId: string;
  quantity: number;
  updatedAt: string;
}

// ============ Fleet & Truck Types ============
export type TruckStatus = 'available' | 'busy' | 'maintenance';

export interface Truck {
  id: string;
  plateNumber: string;
  maxWeightCapacity: number; // kg
  currentLoad: number; // kg
  status: TruckStatus;
  assignedDriverId?: string;
  assignedDriverName?: string;
  createdAt: string;
  updatedAt: string;
}

// ============ Replenishment Order Types ============
export type ReplenishmentStatus = 'pending' | 'ordered' | 'shipped' | 'received';

export interface ReplenishmentOrder {
  id: string;
  itemId: string;
  itemName: string;
  warehouseId: string;
  warehouseName: string;
  deficitQuantity: number; // 需補貨數量
  status: ReplenishmentStatus;
  createdAt: string;
  updatedAt: string;
}

// ============ Dispatch & Route Types ============
export interface DispatchOrder {
  id: string;
  deliveryId: string;
  truckId: string;
  driverId: string;
  driverName: string;
  warehouseId: string;
  assignedItems: {
    itemId: string;
    itemName: string;
    quantity: number;
  }[];
  totalWeight: number;
  routeSequence: string[]; // 配送點 ID 陣列
  estimatedDistance: number; // km
  estimatedDuration: number; // minutes
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
}

// ============ Stock Alert Types ============
export interface StockAlert {
  id: string;
  itemId: string;
  itemName: string;
  warehouseId: string;
  warehouseName: string;
  requestedQuantity: number;
  availableQuantity: number;
  deficitQuantity: number;
  deliveryId: string;
  isResolved: boolean;
  createdAt: string;
}

export type AuthStackParamList = {
  login: undefined;
  register: undefined;
};

export type TabStackParamList = {
  index: undefined;
  dashboard: undefined;
  delivery: undefined;
  profile: undefined;
};
