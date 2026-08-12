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
  /** 設備的影像通道數量（如 4 通道的 VL-6012，6 通道的其他設備），預設由 API 動態獲取 */
  numChannels?: number;
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
  /** 所屬用戶 ID（用於跨設備同步） */
  userId?: string;
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
  /** 取貨相片拍攝時的地址（僅取貨相片使用） */
  locationAddress?: string;
  /** 取貨相片拍攝時的緯度（僅取貨相片使用） */
  locationLatitude?: number;
  /** 取貨相片拍攝時的經度（僅取貨相片使用） */
  locationLongitude?: number;
}

export interface DeliveryOrder {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  pickupContact?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupTime: string;
  dropoffAddress: string;
  dropoffContact?: string;
  dropoffPhone?: string;
  dropoffLatitude?: number;
  dropoffLongitude?: number;
  dropoffTime?: string;
  cargoDescription: string;
  cargoWeight: number;
  notes?: string;
  status: DeliveryStatus;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedAt?: string;
  signatureData?: string;
  signedAt?: string;
  signatureStrokes?: SignatureStroke[][];
  photos?: DeliveryPhoto[];
  createdAt: string;
  /** 配送的物品列表 */
  cargoItems?: DeliveryCargoItem[];
  /** 出貨倉庫 ID（建立時記錄，詳情頁顯示用） */
  warehouseId?: string;
  /** 出貨倉庫名稱（建立時記錄，避免詳情頁需要再次查 Warehouse 表） */
  warehouseName?: string;
  /** 出貨倉庫圖片 URL（建立時快取，詳情頁直接顯示，不依賴 Warehouse 表） */
  warehouseImageUrl?: string;
  /** 所屬用戶 ID（用於跨設備同步） */
  userId?: string;
  /** 所屬公司 ID（用於多租戶隔離） */
  companyId?: string;
  /** 配送費用 */
  deliveryFee?: number;
  /** 代收貨款金額 */
  codAmount?: number;
  /** 已取貨時間戳 */
  pickedUpAt?: string;
  /** 開始運輸時間戳 */
  inTransitAt?: string;
  /** 已送達時間戳 */
  deliveredAt?: string;
  /** 取貨相片 */
  pickupPhotos?: DeliveryPhoto[];
  /** 是否已完成配送單（完成後不能再修改） */
  isCompleted?: boolean;
  /** 完成配送時間戳 */
  completedAt?: string;
}

/** 配送物品 - 包含從庫存選擇的物品 */
export interface DeliveryCargoItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitWeight: number; // kg per unit
  totalWeight: number; // quantity * unitWeight
  /** 物品圖片 URL 或本地資源（建立時快取，詳情頁不需再查 Inventory 表） */
  imageUrl?: string;
  /** 建立時所選的倉庫 ID */
  warehouseId?: string;
  /** 建立時所選的倉庫名稱（詳情頁直接顯示，不依賴 Warehouse 表） */
  warehouseName?: string;
  /** 建立時所選的倉庫圖片 URL（詳情頁直接顯示，不依賴 Warehouse 表） */
  warehouseImageUrl?: string;
  /** 建立時該倉庫的當下庫存（user 體驗參考用） */
  warehouseStockAtOrder?: number;
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
  /** 所屬用戶 ID（用於跨設備同步） */
  userId?: string;
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
  /** 所屬用戶 ID（用於跨設備同步） */
  userId?: string;
}

export interface WarehouseStock {
  id: string;
  warehouseId: string;
  itemId: string;
  quantity: number;
  updatedAt: string;
  /** 所屬用戶 ID */
  userId?: string;
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
  /** 所屬用戶 ID */
  userId?: string;
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
  /** 所屬用戶 ID */
  userId?: string;
}

// ============ Customer Types ============
export interface DeliveryAddress {
  label: string;
  address: string;
  contact?: string;
  phone?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  deliveryAddresses?: DeliveryAddress[];
  notes?: string;
  totalOrders?: number;
  lastOrderAt?: string;
  createdAt: string;
  updatedAt: string;
  /** 所屬用戶 ID */
  userId?: string;
  /** 所屬公司 ID */
  companyId?: string;
  isDeleted?: boolean;
}

// ============ Route & Map Types ============
export type RouteProvider = 'google' | 'mapbox' | 'osrm';
export type RouteStrategy = 'fastest' | 'shortest' | 'balanced';
export type StartLocationMode = 'driver_gps' | 'depot' | 'first_task_origin';
export type EndLocationMode = 'depot' | 'last_task_destination' | 'unlimited';

export interface RouteWaypoint {
  type: 'pickup' | 'dropoff' | 'waypoint' | 'depot' | 'start' | 'end';
  address: string;
  lat?: number;
  lng?: number;
  orderId?: string;
  orderNo?: string;
  customerName?: string;
  /** 預計停留時間（分鐘） */
  dwellTime?: number;
}

export interface RouteLeg {
  /** 起點資訊 */
  start: RouteWaypoint;
  /** 終點資訊 */
  end: RouteWaypoint;
  /** 該段距離（公里） */
  distanceKm: number;
  /** 該段預計時間（分鐘） */
  durationMin: number;
  /** 該段預計通行費 */
  tollFee?: number;
  /** 路線描述 */
  description?: string;
}

export interface RouteOption {
  id: string;
  /** 路線標題 */
  title: string;
  /** 路線副標題 */
  subtitle?: string;
  /** 總距離（公里） */
  totalDistanceKm: number;
  /** 總預計時間（分鐘） */
  totalDurationMin: number;
  /** 總通行費 */
  tollFeeEstimated?: number;
  /** 是否為推薦路線 */
  isRecommended?: boolean;
  /** 路線策略標籤 */
  strategyLabel?: string;
  /** 路線分段 */
  legs: RouteLeg[];
  /** 途經點列表 */
  waypoints: RouteWaypoint[];
  /** 交通狀況標籤 */
  trafficCondition?: 'light' | 'moderate' | 'heavy';
  /** 途經收費道路 */
  hasTolls?: boolean;
  /** 途經高速公路 */
  hasHighway?: boolean;
}

export interface RouteSystemConfig {
  /** 地圖 API 服務提供商 */
  provider: RouteProvider;
  /** API 金鑰（已雜湊） */
  apiKeyHash?: string;
  /** API 金鑰（遮罩顯示） */
  apiKeyMasked?: string;
  /** 是否已設定 */
  hasApiKey?: boolean;
  /** 預設路線策略 */
  defaultStrategy: RouteStrategy;
  /** 啟用 TSP 自動最佳化 */
  enableTspOptimization: boolean;
  /** 預設起點模式 */
  defaultStartLocation: StartLocationMode;
  /** 預設終點模式 */
  defaultEndLocation: EndLocationMode;
  /** 車隊總部/倉庫地址 */
  depotAddress?: string;
  /** 車隊總部/倉庫座標 */
  depotCoords?: { lat: number; lng: number };
  /** 避開收費道路 */
  avoidTolls?: boolean;
  /** 避開高速公路 */
  avoidHighways?: boolean;
  /** 考慮交通路況 */
  considerTraffic?: boolean;
}

export interface DeliveryOrderRoute {
  orderId: string;
  orderNo: string;
  customerName: string;
  pickup: {
    address: string;
    lat?: number;
    lng?: number;
    time?: string;
  };
  dropoff: {
    address: string;
    lat?: number;
    lng?: number;
    time?: string;
  };
  status: DeliveryStatus;
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
  /** 所屬用戶 ID */
  userId?: string;
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
  /** 所屬用戶 ID */
  userId?: string;
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
