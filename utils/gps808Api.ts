/**
 * 808GPS Web API Service
 * Based on: https://console.onefleet.hk/808gps/open/webApi.html
 *
 * Routing strategy:
 * - Mobile (iOS/Android): direct API calls, no CORS issue
 *   → BASE_URL=https://console.onefleet.hk
 *
 * - Web: MUST use proxy to avoid CORS
 *   → If EXPO_PUBLIC_GPS_PROXY_URL is set to a proxy URL (e.g. http://localhost:3001/api/gps),
 *     use that proxy.
 *   → If EXPO_PUBLIC_GPS_PROXY_URL is set to the raw server (e.g. https://console.onefleet.hk),
 *     which is NOT proxy, fall back to localhost:3001 proxy.
 *   → If no EXPO_PUBLIC_GPS_PROXY_URL, default to http://localhost:3001/api/gps
 */

import { Platform } from 'react-native';
import { storage } from './storage';
import { md5 } from 'js-md5';

const IS_WEB = Platform.OS === 'web';

function resolveDefaultBaseUrl(): string {
  if (!IS_WEB) {
    return 'https://console.onefleet.hk';
  }
  // For Web, determine if EXPO_PUBLIC_GPS_PROXY_URL is a proxy or the raw server
  const envUrl = process.env.EXPO_PUBLIC_GPS_PROXY_URL;
  if (envUrl) {
    // If it contains '/api/gps' or 'localhost', it's likely a proxy URL
    if (envUrl.includes('/api/gps') || envUrl.includes('localhost')) {
      // Ensure it ends with /api/gps
      return envUrl.endsWith('/api/gps') ? envUrl : `${envUrl.replace(/\/$/, '')}/api/gps`;
    }
    // Otherwise it's pointing to the raw server (e.g. https://console.onefleet.hk)
    // This causes CORS on Web, so we MUST use the local proxy instead
    console.warn('[GPS808] EXPO_PUBLIC_GPS_PROXY_URL points to raw server, which causes CORS on Web. Using localhost proxy instead.');
  }
  // Default proxy for Web - use localhost:3001 for local dev
  return 'http://localhost:3001/api/gps';
}

const DEFAULT_BASE_URL = resolveDefaultBaseUrl();

const JSESSION_KEY = 'gps808_jsession';
export const SERVER_URL_KEY = 'gps808_server_url';

/** Returns the effective base URL: env server URL > proxy URL. */
async function getEffectiveBaseUrl(): Promise<string> {
  return DEFAULT_BASE_URL;
}

export async function setServerUrl(url: string): Promise<void> {
  await storage.setItem(SERVER_URL_KEY, url);
}

export interface Gps808LoginResult {
  success: boolean;
  jsession?: string;
  error?: string;
  userInfo?: {
    userId: number;
    account: string;
    companyId: number;
    companyName: string;
  };
}

export interface Gps808Vehicle {
  vehiIdno: string;
  devIdno: string;
  vehiId?: number;
  devId?: number;
  companyId?: number;
  companyName?: string;
  plateType?: number;
  /** 1 = online, null/offline = offline */
  onlineStatus?: number;
  /** Latitude in 1e6 format (divide by 1e6 to get decimal) */
  weidu?: number;
  /** Longitude in 1e6 format (divide by 1e6 to get decimal) */
  jindu?: number;
  /** Direct decimal lat/lng (some API responses) */
  lat?: number;
  lng?: number;
  /** Speed in 0.1 km/h (divide by 10 to get km/h) */
  speed?: number;
  /** Direction in degrees (0 = North, clockwise) */
  direction?: number;
  /** GPS upload timestamp (Unix ms) */
  gpsTime?: number;
  status?: string;
}

export interface Gps808Driver {
  id: number;
  name: string;
  phone?: string;
  licenseType?: string;
  licenseNum?: string;
  companyName?: string;
  vehiIdno?: string;
  status?: number;
}

/** Live device status — returned by getDeviceStatus.action */
export interface Gps808DeviceStatus {
  id?: string;       // devIdno
  vid?: string;      // vehiIdno
  lng?: number | string;      // longitude (decimal)
  lat?: number | string;      // latitude (decimal)
  /** Last known latitude in 1e6 format (divide by 1e6 to get decimal) */
  mlat?: number | string;
  /** Last known longitude in 1e6 format (divide by 1e6 to get decimal) */
  mlng?: number | string;
  /** Alternative longitude in 1e6 format */
  lang?: number | string;
  sp?: number | string;       // speed in 0.1 km/h
  ol?: number | string;       // online status (1 = online)
  gt?: number | string;       // GPS time
  hx?: number | string;       // direction in degrees
  ps?: string;                // address
  pk?: number | string;       // park time
  lc?: number | string;       // mileage
  dn?: string;                // driver name
  jn?: string;                // driver job
  /** When lat/lng are both 0, this contains the status code (e.g., 1 = offline) */
  gpsS?: number | string;
}

/** Track history data point */
export interface Gps808TrackPoint {
  id?: string;
  devIdno?: string;
  vehiIdno?: string;
  /** GPS time (Unix timestamp ms or string format) */
  gpsTime?: number | string;
  /** GPS time as string (YYYY-MM-DD HH:MM:SS) */
  gpsTimeStr?: string;
  /** Latitude */
  lat?: number | string;
  /** Longitude */
  lng?: number | string;
  /** Speed in 0.1 km/h */
  speed?: number | string;
  /** Direction in degrees */
  direction?: number | string;
  /** Mileage */
  mileage?: number | string;
  /** Status code */
  status?: number | string;
  /** Address from geocoding */
  address?: string;
  /** Park time (seconds) */
  parkTime?: number | string;
}

export interface Gps808TrackHistoryResponse {
  result: number;
  tracks?: Gps808TrackPoint[];
  /** Total track distance in km */
  distance?: number | string;
  /** Total park time in seconds */
  parkTime?: number | string;
  /** Track GPS mileage */
  trackGPSLiCheng?: number | string;
  /** Track disconnect count */
  trackDisconNum?: number | string;
  pagination?: Gps808Pagination;
  error?: string;
}

export interface Gps808Pagination {
  currentPage: number;
  totalPages: number;
  pageRecords: number;
  totalRecords: number;
}

export interface Gps808ApiResponse<T> {
  result: number;
  infos?: T[];
  pagination?: Gps808Pagination;
  error?: string;
}

function extractJsession(headers: Headers): string | undefined {
  // Browser fetch cannot read Set-Cookie on cross-origin responses, so the
  // Vercel serverless proxy and the localhost proxy both surface the session
  // as `x-session-value` / embedded in JSON. Try both forms.
  const sessionValue = headers.get('x-session-value');
  if (sessionValue) return sessionValue;
  // Legacy path (non-web / response.headers.raw still works):
  let raw = '';
  if (typeof (headers as any).getSetCookie === 'function') {
    raw = (headers as any).getSetCookie().join('; ');
  } else if (typeof (headers as any).raw === 'function') {
    raw = (headers as any).raw()['set-cookie']?.join('; ') ?? '';
  } else {
    raw = headers.get('set-cookie') || headers.get('Set-Cookie') || '';
  }
  // 808GPS server uses both `JSESSIONID` and `jsessionId` cookie names
  const match = raw.match(/(?:JSESSIONID|jsessionId)=([^;]+)/i);
  return match ? match[1] : undefined;
}

async function httpRequest(
  endpoint: string,
  params: Record<string, string | number> = {},
  method: 'GET' | 'POST' = 'GET',
): Promise<Response> {
  const base = await getEffectiveBaseUrl();
  const url = new URL(`${base}${endpoint}`);
  const isGet = method === 'GET';

  if (isGet) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const jsession = await storage.getItem(JSESSION_KEY);
  if (jsession) {
    if (IS_WEB) {
      headers['x-gps-jsession'] = jsession;
    } else {
      headers['Cookie'] = `JSESSIONID=${jsession}`;
    }
  }

  const body = isGet ? undefined : new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();

  return fetch(url.toString(), {
    method,
    headers,
    body,
    ...(IS_WEB ? {} : { credentials: 'include' }),
  });
}

async function apiCall<T>(
  endpoint: string,
  params: Record<string, string | number> = {},
  method: 'GET' | 'POST' = 'GET',
): Promise<Gps808ApiResponse<T>> {
  try {
    const res = await httpRequest(endpoint, params, method);

    const jsession = extractJsession(res.headers);
    if (jsession) {
      await storage.setItem(JSESSION_KEY, jsession);
    }

    const json = await res.json() as Gps808ApiResponse<T>;
    return json;
  } catch (err) {
    return { result: -1, error: String(err) };
  }
}

export const gps808Api = {
  /**
   * Login - POST /Login/login.action
   * Param: account, password
   * Returns JSESSIONID cookie on success (result === 0)
   * Note: /Login/login.action is the correct endpoint for the web API
   * 
   * Web 端特別處理：從 proxy 返回的 JSON 中提取 _proxySession
   */
  async login(account: string, password: string): Promise<Gps808LoginResult> {
    const base = await getEffectiveBaseUrl();
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      // 808GPS API requires MD5 encrypted password via password parameter
      const encryptedPassword = md5(password);

      const url = `${base}/StandardApiAction_login.action`;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: new URLSearchParams({ account, password: encryptedPassword }).toString(),
        ...(IS_WEB ? {} : { credentials: 'include' }),
      });

      // 首先獲取響應文本
      const text = await res.text();

      // 嘗試從 JSON 響應中提取 session（proxy 會在 JSON 中返回 _proxySession）
      let jsession: string | undefined;
      let jsonResponse: Record<string, unknown> | null = null;

      try {
        jsonResponse = JSON.parse(text);
        // 從 proxy 返回的 JSON 中提取 session
        if (jsonResponse && typeof jsonResponse === 'object') {
          if ((jsonResponse as Record<string, unknown>)._proxySession) {
            jsession = (jsonResponse as Record<string, unknown>)._proxySession as string;
            console.log('[GPS808] 從 proxy 響應中獲取 session:', jsession?.substring(0, 16) + '...');
          }
        }
      } catch {
        // 不是 JSON，嘗試從 header 提取
      }

      // 如果沒有從 JSON 獲取到，嘗試從 headers 提取（原生環境）
      if (!jsession && IS_WEB) {
        // Web 端無法通過 headers.get('set-cookie') 獲取（瀏覽器安全限制）
        // 但 proxy 會在 JSON 中返回，所以上面已經處理了
      }

      if (jsession) {
        await storage.setItem(JSESSION_KEY, jsession);
        await storage.setItem(SERVER_URL_KEY, base);
        let userInfo: Gps808LoginResult['userInfo'] = {
          account, userId: 0, companyId: 0, companyName: '',
        };
        if (jsonResponse) {
          userInfo = {
            account,
            userId: (jsonResponse.userId as number) ?? 0,
            companyId: (jsonResponse.companyId as number) ?? 0,
            companyName: (jsonResponse.companyName as string) ?? '',
          };
        }
        return { success: true, jsession, userInfo };
      }

      // 嘗試從 header 提取（原生環境）
      const headerJsession = extractJsession(res.headers);
      if (headerJsession) {
        await storage.setItem(JSESSION_KEY, headerJsession);
        await storage.setItem(SERVER_URL_KEY, base);
        let userInfo: Gps808LoginResult['userInfo'] = {
          account, userId: 0, companyId: 0, companyName: '',
        };
        try {
          if (jsonResponse) {
            userInfo = {
              account,
              userId: (jsonResponse.userId as number) ?? 0,
              companyId: (jsonResponse.companyId as number) ?? 0,
              companyName: (jsonResponse.companyName as string) ?? '',
            };
          }
        } catch { /* non-JSON */ }
        return { success: true, jsession: headerJsession, userInfo };
      }

      if (text.includes('result":0') || text.includes('"result": 0')) {
        return { success: true, error: 'Login OK but no session received' };
      }

      return { success: false, error: `Invalid credentials (${res.status})` };
    } catch (err) {
      return { success: false, error: `Network error: ${String(err)}` };
    }
  },

  /**
   * Logout - POST /StandardApiAction_logout.action
   */
  async logout(): Promise<void> {
    try {
      await httpRequest('/StandardApiAction_logout.action', {}, 'POST');
    } finally {
      await storage.removeItem(JSESSION_KEY);
    }
  },

  /**
   * Query vehicle list - GET /StandardApiAction_queryVehicleList.action
   * Supports filtering by plate number (vehiIdno) or device ID (devIdno)
   */
  async queryVehicleList(
    page: number = 1,
    pageRecords: number = 200,
    filter?: { vehiIdno?: string; devIdno?: string; companyName?: string },
  ): Promise<Gps808ApiResponse<Gps808Vehicle>> {
    const params: Record<string, string | number> = { currentPage: page, pageRecords };
    if (filter?.vehiIdno) params.vehiIdno = filter.vehiIdno;
    if (filter?.devIdno) params.devIdno = filter.devIdno;
    if (filter?.companyName) params.companyName = filter.companyName;
    return apiCall<Gps808Vehicle>('/StandardApiAction_queryVehicleList.action', params);
  },

  /**
   * Get device live status (GPS, speed, online) - GET /StandardApiAction_getDeviceStatus.action
   * Param: devIdno
   * Returns: { result, id, vid, lng, lat, mlat, mlng, sp, ol, gt, hx, ps, ... }
   *
   * Note: The API returns GPS data in the 'status' object. Coordinates may be:
   * - lat/lng: current GPS (sometimes "null" string when no fix)
   * - mlat/mlng: last known position in 1e6 format (e.g., "22354821" = 22.354821)
   * - lang: longitude (also in 1e6 format)
   */
  async getDeviceStatus(devIdno: string, includeAddress = true): Promise<{
    result: number;
    status?: Gps808DeviceStatus;
    error?: string;
  }> {
    try {
      const res = await apiCall<Record<string, unknown>>(
        '/StandardApiAction_getDeviceStatus.action',
        { devIdno, toMap: 1, ...(includeAddress ? { geoaddress: 1 } : {}) },
      );
      if (res.result === 0) {
        // status is an array: { result: 0, status: [{ id, vid, lng, lat, ... }] }
        const statusArray = Array.isArray(res.status) ? res.status : [];
        const firstStatus = (statusArray[0] as unknown as Gps808DeviceStatus) ?? {};
        return { result: 0, status: firstStatus };
      }
      return { result: res.result, error: res.error || `API error: result=${res.result}` };
    } catch (err) {
      return { result: -1, error: String(err) };
    }
  },

  /**
   * Query vehicle info by device ID - GET /StandardApiAction_findVehicleInfoByDeviceId.action
   * Param: devIdno (device number)
   */
  async findVehicleInfoByDeviceId(devIdno: string): Promise<Gps808ApiResponse<Gps808Vehicle>> {
    return apiCall<Gps808Vehicle>('/StandardApiAction_findVehicleInfoByDeviceId.action', { devIdno });
  },

  /**
   * Query driver info by device ID - GET /StandardApiAction_findDriverInfoByDeviceId.action
   */
  async findDriverInfoByDeviceId(
    devIdno: string,
    lastUpdateTime?: string,
  ): Promise<Gps808ApiResponse<Gps808Driver>> {
    const params: Record<string, string> = { devIdno };
    if (lastUpdateTime) params.lastUpdateTime = lastUpdateTime;
    return apiCall<Gps808Driver>('/StandardApiAction_findDriverInfoByDeviceId.action', params);
  },

  /**
   * Query access area info - GET /StandardApiAction_queryAccessAreaInfo.action
   */
  async queryAccessAreaInfo(
    vehiIdno: string,
    begintime: string,
    endtime: string,
    toMap: 1 | 2 = 2,
  ): Promise<Gps808ApiResponse<Record<string, unknown>>> {
    return apiCall<Record<string, unknown>>('/StandardApiAction_queryAccessAreaInfo.action', {
      vehiIdno, begintime, endtime, toMap,
    });
  },

  /**
   * Query punch card record - GET /StandardApiAction_queryPunchCardRecode.action
   */
  async queryPunchCardRecord(
    vehiIdno: string,
    begintime: string,
    endtime: string,
    page: number = 1,
    pageRecords: number = 20,
  ): Promise<Gps808ApiResponse<Record<string, unknown>>> {
    return apiCall<Record<string, unknown>>('/StandardApiAction_queryPunchCardRecode.action', {
      vehiIdno, begintime, endtime, currentPage: page, pageRecords,
    });
  },

  /**
   * Check current session validity
   */
  async ping(): Promise<boolean> {
    const jsession = await storage.getItem(JSESSION_KEY);
    if (!jsession) return false;
    try {
      const base = await getEffectiveBaseUrl();
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (IS_WEB) {
        headers['x-gps-jsession'] = jsession;
      } else {
        headers['Cookie'] = `JSESSIONID=${jsession}`;
      }
      const res = await fetch(
        `${base}/StandardApiAction_queryVehicleList.action?currentPage=1&pageRecords=1`,
        { headers },
      );
      if (!res.ok) return false;
      const json = await res.json() as Gps808ApiResponse<unknown>;
      return json.result === 0;
    } catch {
      return false;
    }
  },

  /**
   * Get stored jsession
   */
  async getStoredSession(): Promise<string | null> {
    return storage.getItem(JSESSION_KEY);
  },

  /**
   * Get device track history - GET /StandardApiAction_queryTrackDetail.action
   * Param: devIdno, begintime (YYYY-MM-DD HH:MM:SS), endtime (YYYY-MM-DD HH:MM:SS)
   * Optional: distance (0=show all), parkTime (0=show all), currentPage, pageRecords, toMap (1=with address)
   */
  async getTrackHistory(
    devIdno: string,
    begintime: string,
    endtime: string,
    options?: {
      distance?: number;
      parkTime?: number;
      currentPage?: number;
      pageRecords?: number;
      toMap?: number;
    },
  ): Promise<Gps808TrackHistoryResponse> {
    const params: Record<string, string | number> = {
      devIdno,
      begintime,
      endtime,
      distance: options?.distance ?? 0,
      parkTime: options?.parkTime ?? 0,
      currentPage: options?.currentPage ?? 1,
      pageRecords: options?.pageRecords ?? 100,
      toMap: options?.toMap ?? 1,
    };
    return apiCall<Gps808TrackPoint>('/StandardApiAction_queryTrackDetail.action', params);
  },
};
