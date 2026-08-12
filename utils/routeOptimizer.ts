/**
 * TSP (Traveling Salesman Problem) 求解器與路線最佳化工具
 * 使用最近鄰居啟發式算法 (Nearest Neighbor Heuristic) 與 2-opt 改善法
 */

import type { RouteWaypoint, DeliveryOrderRoute } from '@/types';
import { addressToCoords } from './warehouseCoords';

interface DistanceMatrix {
  /** 距離矩陣（公里） */
  distances: number[][];
  /** 時間矩陣（分鐘，基於平均時速 30km/h） */
  durations: number[][];
}

/**
 * 計算兩點之間的 Haversine 距離（公里）
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // 地球半徑（公里）
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * 從地址獲取座標（使用 warehouseCoords 的雜湊方法作為備用）
 */
export function getCoordsFromAddress(address: string): { lat: number; lng: number } {
  return addressToCoords(address);
}

/**
 * 確保地址有座標（如果沒有，嘗試從地址解析或使用預設值）
 */
function ensureCoords(waypoint: RouteWaypoint): RouteWaypoint {
  if (waypoint.lat !== undefined && waypoint.lng !== undefined) {
    return waypoint;
  }
  const coords = getCoordsFromAddress(waypoint.address);
  return {
    ...waypoint,
    lat: coords.lat,
    lng: coords.lng,
  };
}

/**
 * 計算距離矩陣
 */
export function buildDistanceMatrix(waypoints: RouteWaypoint[]): DistanceMatrix {
  const n = waypoints.length;
  const distances: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));
  const durations: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  const ensuredWaypoints = waypoints.map(ensureCoords);
  const AVG_SPEED_KMH = 30; // 香港市區平均時速 30km/h

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        distances[i][j] = 0;
        durations[i][j] = 0;
      } else {
        const wp1 = ensuredWaypoints[i];
        const wp2 = ensuredWaypoints[j];
        if (wp1.lat !== undefined && wp1.lng !== undefined &&
            wp2.lat !== undefined && wp2.lng !== undefined) {
          distances[i][j] = haversineDistance(
            wp1.lat, wp1.lng,
            wp2.lat, wp2.lng
          );
        } else {
          // 如果沒有有效座標，給予較大的估計值
          distances[i][j] = 10; // 預設 10km
        }
        // 根據距離計算預計時間（考慮城市道路通常比直線距離長 1.3 倍）
        durations[i][j] = Math.round((distances[i][j] * 1.3) / (AVG_SPEED_KMH / 60));
      }
    }
  }

  return { distances, durations };
}

/**
 * 最近鄰居啟發式算法
 */
function nearestNeighbor(
  distanceMatrix: DistanceMatrix['distances'],
  startIndex: number
): number[] {
  const n = distanceMatrix.length;
  const visited = new Set<number>([startIndex]);
  const route: number[] = [startIndex];

  while (visited.size < n) {
    const current = route[route.length - 1];
    let nearest = -1;
    let minDistance = Infinity;

    for (let j = 0; j < n; j++) {
      if (!visited.has(j) && distanceMatrix[current][j] < minDistance) {
        nearest = j;
        minDistance = distanceMatrix[current][j];
      }
    }

    if (nearest !== -1) {
      route.push(nearest);
      visited.add(nearest);
    }
  }

  return route;
}

/**
 * 2-opt 改善法 - 通過反轉路徑片段來改善總距離
 */
function twoOptImprove(
  route: number[],
  distanceMatrix: number[][]
): number[] {
  let improved = true;
  let bestRoute = [...route];
  let bestDistance = calculateTotalDistance(route, distanceMatrix);

  while (improved) {
    improved = false;
    for (let i = 1; i < bestRoute.length - 1; i++) {
      for (let j = i + 1; j < bestRoute.length; j++) {
        const newRoute = twoOptSwap(bestRoute, i, j);
        const newDistance = calculateTotalDistance(newRoute, distanceMatrix);
        if (newDistance < bestDistance) {
          bestRoute = newRoute;
          bestDistance = newDistance;
          improved = true;
        }
      }
    }
  }

  return bestRoute;
}

function twoOptSwap(route: number[], i: number, j: number): number[] {
  const newRoute = [
    ...route.slice(0, i),
    ...route.slice(i, j + 1).reverse(),
    ...route.slice(j + 1),
  ];
  return newRoute;
}

function calculateTotalDistance(route: number[], distanceMatrix: number[][]): number {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += distanceMatrix[route[i]][route[i + 1]];
  }
  return total;
}

function calculateTotalDuration(route: number[], durationMatrix: number[][]): number {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += durationMatrix[route[i]][route[i + 1]];
  }
  return total;
}

/**
 * 優化配送順序（TSP 求解）
 * @param waypoints 配送點列表
 * @param startIndex 起始點索引（預設為 0）
 * @returns 優化後的索引順序
 */
export function optimizeDeliverySequence(
  waypoints: RouteWaypoint[],
  startIndex: number = 0
): number[] {
  if (waypoints.length <= 2) {
    return waypoints.map((_, i) => i);
  }

  const { distances, durations } = buildDistanceMatrix(waypoints);
  
  // 使用最近鄰居生成初始路徑
  let route = nearestNeighbor(distances, startIndex);
  
  // 使用 2-opt 改善
  route = twoOptImprove(route, distances);

  return route;
}

/**
 * 從配送單生成路線點
 */
export function ordersToWaypoints(orders: DeliveryOrderRoute[]): RouteWaypoint[] {
  const waypoints: RouteWaypoint[] = [];

  for (const order of orders) {
    // 添加取貨點
    waypoints.push({
      type: 'pickup',
      address: order.pickup.address,
      lat: order.pickup.lat,
      lng: order.pickup.lng,
      orderId: order.orderId,
      orderNo: order.orderNo,
      customerName: order.customerName,
    });

    // 添加送貨點
    waypoints.push({
      type: 'dropoff',
      address: order.dropoff.address,
      lat: order.dropoff.lat,
      lng: order.dropoff.lng,
      orderId: order.orderId,
      orderNo: order.orderNo,
      customerName: order.customerName,
    });
  }

  return waypoints;
}

/**
 * 生成多條路線建議
 */
export function generateRouteSuggestions(
  waypoints: RouteWaypoint[],
  startLocation?: RouteWaypoint,
  endLocation?: RouteWaypoint
): {
  fastest: number[];
  shortest: number[];
  optimized: number[];
} {
  if (waypoints.length === 0) {
    return { fastest: [], shortest: [], optimized: [] };
  }

  if (waypoints.length === 1) {
    return { fastest: [0], shortest: [0], optimized: [0] };
  }

  // 構建不含起點/終點的中間點矩陣
  let middlePoints = waypoints;
  let startIdx = 0;
  let endIdx = waypoints.length - 1;

  // 如果有指定的起點或終點，將它們加入到矩陣中
  if (startLocation) {
    middlePoints = [startLocation, ...waypoints];
    startIdx = 0;
  }
  if (endLocation) {
    middlePoints = [...middlePoints, endLocation];
    endIdx = middlePoints.length - 1;
  }

  const { distances, durations } = buildDistanceMatrix(middlePoints);

  // 方案 A：最快時間（基於時間矩陣的最近鄰居）
  const fastestRoute = nearestNeighbor(durations, startIdx);
  const fastestOptimized = twoOptImprove(fastestRoute, durations);

  // 方案 B：最短距離（基於距離矩陣的最近鄰居）
  const shortestRoute = nearestNeighbor(distances, startIdx);
  const shortestOptimized = twoOptImprove(shortestRoute, distances);

  // 方案 C：綜合優化（交替使用距離和時間）
  const optimizedRoute = optimizeDeliverySequence(middlePoints, startIdx);

  return {
    fastest: fastestOptimized,
    shortest: shortestOptimized,
    optimized: optimizedRoute,
  };
}

/**
 * 計算路線總結
 */
export function calculateRouteSummary(
  route: number[],
  waypoints: RouteWaypoint[],
  distanceMatrix: DistanceMatrix
): {
  totalDistance: number;
  totalDuration: number;
  avgSpeed: number;
  tollEstimate: number;
} {
  if (route.length === 0) {
    return { totalDistance: 0, totalDuration: 0, avgSpeed: 0, tollEstimate: 0 };
  }

  let totalDistance = 0;
  let totalDuration = 0;

  for (let i = 0; i < route.length - 1; i++) {
    totalDistance += distanceMatrix.distances[route[i]][route[i + 1]];
    totalDuration += distanceMatrix.durations[route[i]][route[i + 1]];
  }

  // 簡單的收費道路估算（香港高速公路約 HKD 30-50/段）
  const tollEstimate = Math.round(totalDistance / 10) * 30;

  // 平均時速
  const avgSpeed = totalDuration > 0 
    ? Math.round((totalDistance / totalDuration) * 60) 
    : 0;

  return {
    totalDistance: Math.round(totalDistance * 10) / 10,
    totalDuration,
    avgSpeed,
    tollEstimate,
  };
}

/**
 * 生成路線描述（人類可讀的路線說明）
 */
export function generateRouteDescription(
  route: number[],
  waypoints: RouteWaypoint[]
): string[] {
  const descriptions: string[] = [];

  for (let i = 0; i < route.length - 1; i++) {
    const from = waypoints[route[i]];
    const to = waypoints[route[i + 1]];

    let segment = '';
    if (from.type === 'depot' || from.type === 'start') {
      segment = `從 ${from.address}`;
    } else if (from.type === 'pickup') {
      segment = `從取貨點 ${from.address}`;
    } else {
      segment = `從 ${to.address}`;
    }

    if (to.type === 'dropoff' || to.type === 'end') {
      segment += ` 到送貨點 ${to.address}`;
    } else {
      segment += ` 到 ${to.address}`;
    }

    descriptions.push(segment);
  }

  return descriptions;
}

/**
 * 驗證配送單是否有效（可以用於路線規劃）
 */
export function validateOrdersForRouting(orders: DeliveryOrderRoute[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const order of orders) {
    if (!order.pickup.address && !order.pickup.lat) {
      errors.push(`訂單 ${order.orderNo} 缺少取貨地址`);
    }
    if (!order.dropoff.address && !order.dropoff.lat) {
      errors.push(`訂單 ${order.orderNo} 缺少送貨地址`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
