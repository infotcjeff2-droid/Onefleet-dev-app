/**
 *路線 API 整合工具
 * 支持 Google Maps, Mapbox, OSRM 三種地圖 API 服務
 */

import type { RouteWaypoint, RouteLeg, RouteOption, RouteProvider } from '@/types';
import { getCoordsFromAddress } from './routeOptimizer';

interface GeocodeResult {
  address: string;
  lat: number;
  lng: number;
  formattedAddress?: string;
}

interface RouteResult {
  totalDistanceKm: number;
  totalDurationMin: number;
  legs: RouteLeg[];
  tollFee?: number;
  hasTolls?: boolean;
  hasHighway?: boolean;
  trafficCondition?: 'light' | 'moderate' | 'heavy';
  polyline?: string; // 路線編碼
}

/**
 * 地理編碼 - 將地址轉換為座標
 */
export async function geocodeAddress(
  address: string,
  provider: RouteProvider,
  apiKey?: string
): Promise<GeocodeResult | null> {
  try {
    switch (provider) {
      case 'google': {
        if (!apiKey) return null;
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)},Hong+Kong&key=${apiKey}`
        );
        const data = await response.json();
        if (data.status === 'OK' && data.results.length > 0) {
          const result = data.results[0];
          return {
            address,
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
            formattedAddress: result.formatted_address,
          };
        }
        return null;
      }
      case 'mapbox': {
        if (!apiKey) return null;
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address + ', Hong Kong')}.json?access_token=${apiKey}`
        );
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const result = data.features[0];
          const [lng, lat] = result.center;
          return {
            address,
            lat,
            lng,
            formattedAddress: result.place_name,
          };
        }
        return null;
      }
      case 'osrm': {
        // OSRM 使用 Nominatim 進行地理編碼
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ', Hong Kong')}&format=json&limit=1`
        );
        const data = await response.json();
        if (data.length > 0) {
          return {
            address,
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            formattedAddress: data[0].display_name,
          };
        }
        return null;
      }
      default:
        return null;
    }
  } catch (error) {
    console.error('[routeApi] geocodeAddress error:', error);
    return null;
  }
}

/**
 * 批量地理編碼
 */
export async function geocodeAddresses(
  addresses: string[],
  provider: RouteProvider,
  apiKey?: string
): Promise<GeocodeResult[]> {
  const results: GeocodeResult[] = [];
  
  // 批量請求（每個 API 有不同的限制）
  for (const address of addresses) {
    const result = await geocodeAddress(address, provider, apiKey);
    if (result) {
      results.push(result);
    } else {
      // 如果地理編碼失敗，使用預設的雜湊座標
      const coords = getCoordsFromAddress(address);
      results.push({
        address,
        lat: coords.lat,
        lng: coords.lng,
      });
    }
  }
  
  return results;
}

/**
 * 計算路線
 */
export async function calculateRoute(
  origin: RouteWaypoint,
  destination: RouteWaypoint,
  provider: RouteProvider,
  apiKey?: string,
  options?: {
    avoidTolls?: boolean;
    avoidHighways?: boolean;
    considerTraffic?: boolean;
  }
): Promise<RouteResult | null> {
  try {
    // 確保座標
    const originCoords = origin.lat !== undefined && origin.lng !== undefined
      ? { lat: origin.lat, lng: origin.lng }
      : getCoordsFromAddress(origin.address);
    
    const destCoords = destination.lat !== undefined && destination.lng !== undefined
      ? { lat: destination.lat, lng: destination.lng }
      : getCoordsFromAddress(destination.address);

    switch (provider) {
      case 'google': {
        if (!apiKey) return null;
        const avoid = [];
        if (options?.avoidTolls) avoid.push('tolls');
        if (options?.avoidHighways) avoid.push('highways');

        const params = new URLSearchParams({
          origin: `${originCoords.lat},${originCoords.lng}`,
          destination: `${destCoords.lat},${destCoords.lng}`,
          key: apiKey,
        });
        if (avoid.length > 0) params.set('avoid', avoid.join('|'));
        if (options?.considerTraffic) params.set('departure_time', 'now');

        const response = await fetch(
          `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`
        );
        const data = await response.json();
        
        if (data.status === 'OK' && data.routes.length > 0) {
          const route = data.routes[0];
          let totalDistance = 0;
          let totalDuration = 0;
          const legs: RouteLeg[] = [];

          for (const leg of route.legs) {
            totalDistance += leg.distance.value / 1000; // km
            totalDuration += Math.round(leg.duration_in_traffic?.value ?? leg.duration.value / 60); // min
            legs.push({
              start: origin,
              end: destination,
              distanceKm: Math.round(leg.distance.value / 1000 * 10) / 10,
              durationMin: Math.round(leg.duration_in_traffic?.value ?? leg.duration.value / 60),
              description: `${leg.start_address} → ${leg.end_address}`,
            });
          }

          return {
            totalDistanceKm: Math.round(totalDistance * 10) / 10,
            totalDurationMin: totalDuration,
            legs,
            polyline: route.overview_polyline.points,
          };
        }
        return null;
      }
      case 'mapbox': {
        if (!apiKey) return null;
        const avoid = [];
        if (options?.avoidTolls) avoid.push('toll');
        if (options?.avoidHighways) avoid.push('motorway');

        const coordinates = `${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}`;
        let url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?access_token=${apiKey}&geometries=polyline&overview=full`;
        
        if (avoid.length > 0) {
          url += `&exclude=${avoid.join(',')}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          return {
            totalDistanceKm: Math.round(route.distance / 1000 * 10) / 10,
            totalDurationMin: Math.round(route.duration / 60),
            legs: [{
              start: origin,
              end: destination,
              distanceKm: Math.round(route.distance / 1000 * 10) / 10,
              durationMin: Math.round(route.duration / 60),
              description: `${origin.address} → ${destination.address}`,
            }],
            polyline: route.geometry,
          };
        }
        return null;
      }
      case 'osrm': {
        // OSRM 是公開 API，無需 API Key
        const coordinates = `${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}`;
        let url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=polyline`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.code === 'Ok' && data.routes.length > 0) {
          const route = data.routes[0];
          return {
            totalDistanceKm: Math.round(route.distance / 1000 * 10) / 10,
            totalDurationMin: Math.round(route.duration / 60),
            legs: [{
              start: origin,
              end: destination,
              distanceKm: Math.round(route.distance / 1000 * 10) / 10,
              durationMin: Math.round(route.duration / 60),
              description: `${origin.address} → ${destination.address}`,
            }],
            polyline: route.geometry,
          };
        }
        return null;
      }
      default:
        return null;
    }
  } catch (error) {
    console.error('[routeApi] calculateRoute error:', error);
    return null;
  }
}

/**
 * 計算多點路線
 */
export async function calculateMultiStopRoute(
  waypoints: RouteWaypoint[],
  provider: RouteProvider,
  apiKey?: string,
  options?: {
    avoidTolls?: boolean;
    avoidHighways?: boolean;
    considerTraffic?: boolean;
  }
): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;

  try {
    const legs: RouteLeg[] = [];
    let totalDistance = 0;
    let totalDuration = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const result = await calculateRoute(
        waypoints[i],
        waypoints[i + 1],
        provider,
        apiKey,
        options
      );

      if (result) {
        totalDistance += result.totalDistanceKm;
        totalDuration += result.totalDurationMin;
        legs.push(...result.legs);
      }
    }

    return {
      totalDistanceKm: Math.round(totalDistance * 10) / 10,
      totalDurationMin: totalDuration,
      legs,
      tollFee: Math.round(totalDistance / 10) * 30, // 估算通行費
      hasTolls: options?.avoidTolls ? false : totalDistance > 5,
      hasHighway: !options?.avoidHighways && totalDistance > 10,
    };
  } catch (error) {
    console.error('[routeApi] calculateMultiStopRoute error:', error);
    return null;
  }
}

/**
 * 生成路線建議（模擬真實 API 結果，用於離線或未設定 API 的情況）
 */
export function generateMockRouteSuggestions(
  waypoints: RouteWaypoint[]
): RouteOption[] {
  if (waypoints.length === 0) return [];

  // 計算總里程和時間的估算值
  let totalDistance = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    const fromCoords = from.lat !== undefined && from.lng !== undefined
      ? { lat: from.lat, lng: from.lng }
      : getCoordsFromAddress(from.address);
    const toCoords = to.lat !== undefined && to.lng !== undefined
      ? { lat: to.lat, lng: to.lng }
      : getCoordsFromAddress(to.address);
    
    // Haversine 估算
    const R = 6371;
    const dLat = (toCoords.lat - fromCoords.lat) * Math.PI / 180;
    const dLng = (toCoords.lng - fromCoords.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(fromCoords.lat * Math.PI / 180) * Math.cos(toCoords.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c * 1.3; // 乘以 1.3 估算實際道路距離
    totalDistance += distance;
  }

  // 確保至少有一個最小值（每站至少 2km，每小時 30km）
  const MIN_DISTANCE_PER_STOP = 2; // 每站最少 2km
  const MIN_TOTAL_DISTANCE = Math.max(totalDistance, waypoints.length * MIN_DISTANCE_PER_STOP);
  const totalDuration = Math.round((MIN_TOTAL_DISTANCE / 30) * 60); // 30 km/h 平均速度

  // 方案 A：最快路線
  const fastestOption: RouteOption = {
    id: 'fastest',
    title: '方案 A（最快）',
    subtitle: '經主要幹道',
    totalDistanceKm: Math.round(MIN_TOTAL_DISTANCE * 10) / 10,
    totalDurationMin: totalDuration,
    isRecommended: true,
    strategyLabel: '最快時間',
    waypoints,
    legs: waypoints.map((wp, i) => ({
      start: wp,
      end: waypoints[i + 1] || wp,
      distanceKm: Math.round(MIN_TOTAL_DISTANCE / waypoints.length * 10) / 10,
      durationMin: Math.round(totalDuration / waypoints.length),
    })).slice(0, -1),
    trafficCondition: 'moderate',
    hasHighway: true,
  };

  // 方案 B：最省錢路線
  const cheapestOption: RouteOption = {
    id: 'cheapest',
    title: '方案 B（省錢）',
    subtitle: '避開收費道路',
    totalDistanceKm: Math.round(MIN_TOTAL_DISTANCE * 1.15 * 10) / 10,
    totalDurationMin: Math.round(totalDuration * 1.2),
    tollFeeEstimated: 0,
    strategyLabel: '最少收費',
    waypoints,
    legs: fastestOption.legs,
    hasTolls: false,
    hasHighway: false,
  };

  // 方案 C：最短距離路線
  const shortestOption: RouteOption = {
    id: 'shortest',
    title: '方案 C（最短）',
    subtitle: '直線距離最優',
    totalDistanceKm: Math.round(MIN_TOTAL_DISTANCE * 10) / 10,
    totalDurationMin: Math.round(totalDuration * 1.1),
    strategyLabel: '最短距離',
    waypoints,
    legs: fastestOption.legs,
    trafficCondition: 'light',
  };

  return [fastestOption, cheapestOption, shortestOption];
}

/**
 * 打開外部導航應用
 */
export function openExternalNavigation(
  destination: { lat: number; lng: number; address: string },
  app: 'google' | 'apple' | 'waze' = 'google'
): void {
  const encodedAddress = encodeURIComponent(destination.address);
  const lat = destination.lat;
  const lng = destination.lng;

  let url: string;

  switch (app) {
    case 'google':
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      break;
    case 'apple':
      url = `http://maps.apple.com/?daddr=${lat},${lng}`;
      break;
    case 'waze':
      url = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
      break;
    default:
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  if (typeof window !== 'undefined') {
    window.open(url, '_blank');
  }
}

/**
 * 格式化時間顯示
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} 分鐘`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours} 小時 ${mins} 分鐘` : `${hours} 小時`;
}

/**
 * 格式化距離顯示
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} 米`;
  }
  return `${km.toFixed(1)} 公里`;
}
