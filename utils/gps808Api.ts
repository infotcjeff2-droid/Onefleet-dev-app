/**
 * 808GPS Web API Service
 * Based on: https://console.onefleet.hk/808gps/open/webApi.html
 *
 * Routing strategy:
 * - Mobile (iOS/Android): direct API calls, no CORS issue
 *   → BASE_URL=https://console.onefleet.hk
 *
 * - Web: MUST use proxy to avoid CORS
 *   → Dynamically constructs proxy URL from current page origin
 *   → If page is at http://192.168.1.55:8081, proxy is http://192.168.1.55:3001
 *   → Falls back to localhost:3001 if origin cannot be determined
 */

import { Platform } from 'react-native';
import { storage } from './storage';
import { md5 } from 'js-md5';

const IS_WEB = Platform.OS === 'web';
const PROXY_PORT = 3001; // GPS Proxy Server port

const JSESSION_KEY = 'gps808_jsession';
export const SERVER_URL_KEY = 'gps808_server_url';
// 注意：必須在 getWebBaseUrl 之前宣告，因為函式宣告會被 hoisting 而 let 不會
let runtimeServerUrl: string | null = null;

/**
 * 動態讀取 base URL（每次呼叫皆重新計算，避免 reload/route 切換後使用過期值）。
 * 優先順序：
 *   1. storage 中先前 setServerUrl() 設定的值（per-user 持久化）
 *   2. EXPO_PUBLIC_GPS_PROXY_URL（雲端部署）
 *   3. window.location.origin 動態 origin（本機 / LAN 開發）
 *   4. http://localhost:3001/api/gps（本機 fallback）
 *   5. 非 Web：https://console.onefleet.hk
 */

/** 記憶體快取：避免每次 API 呼叫都做字串處理 */
function getWebBaseUrl(): string {
  if (runtimeServerUrl) return runtimeServerUrl;
  // 1. 雲端 URL（Vercel 部署）
  const envUrl = process.env.EXPO_PUBLIC_GPS_PROXY_URL;
  if (envUrl) {
    runtimeServerUrl = envUrl.replace(/\/$/, '');
    return runtimeServerUrl;
  }

  // 2. 動態 origin：LAN 訪問時把 port 換成 PROXY_PORT
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      runtimeServerUrl = `http://localhost:${PROXY_PORT}/api/gps`;
      return runtimeServerUrl;
    }
    // LAN 訪問：把 port 從 metro dev server 換成 GPS proxy port
    if (window.location?.port) {
      runtimeServerUrl = `${window.location.protocol}//${host}:${PROXY_PORT}/api/gps`;
      return runtimeServerUrl;
    }
    // 同源部署（reverse proxy）：origin 已經對應 proxy
    runtimeServerUrl = `${window.location.origin}/api/gps`;
    return runtimeServerUrl;
  }

  // 3. Fallback：localhost:3001
  runtimeServerUrl = `http://localhost:${PROXY_PORT}/api/gps`;
  return runtimeServerUrl;
}

/**
 * 同步版本：取得 Web 端的 proxy 對外 base URL（不含 /api/gps path）。
 * 用途：在元件 render / 建構影像串流 URL 時即時取得正確的 host。
 *
 * 解析優先順序：
 *   1. EXPO_PUBLIC_GPS_PROXY_URL（環境變數，雲端部署時優先使用）
 *   2. 本機入口（localhost / 127.0.0.1 / ::1）→ 直接打 PROXY_PORT，
 *      避免 expo metro dev server 攔截 /api/gps 路由
 *   3. window.location.origin（其他部署環境）
 *
 * 呼叫端範例： `${getWebProxyBaseUrlSync()}/flv-stream?...`
 *   → 本地時  http://localhost:3001
 *   → 雲端時  https://fleet-gps-proxy.xxx.workers.dev
 */
export function getWebProxyBaseUrlSync(): string {
  // 優先使用環境變數（Cloudflare Worker URL）
  const envUrl = process.env.EXPO_PUBLIC_GPS_PROXY_URL;
  if (envUrl) {
    // 去掉 /api/gps 後綴，因為呼叫端會加上路徑
    return envUrl.replace(/\/api\/gps\/?$/, '').replace(/\/$/, '');
  }

  if (typeof window !== 'undefined' && (window as any).location?.hostname) {
    const host = (window as any).location.hostname;

    // localhost 開發環境：使用本機 proxy
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return `http://localhost:${PROXY_PORT}`;
    }

    // 其他部署環境：使用當前頁面的 origin
    return (window as any).location.origin;
  }

  return `http://localhost:${PROXY_PORT}`;
}

/** 清除 runtime cache — 切換 user 或 reload 之後使用 */
export function resetServerUrlCache(): void {
  runtimeServerUrl = null;
}

async function getWebStoredServerUrl(): Promise<string | null> {
  try {
    return await storage.getItem(SERVER_URL_KEY);
  } catch {
    return null;
  }
}

/** Returns the effective base URL: env/proxy URL > stored URL > default. */
async function getEffectiveBaseUrl(): Promise<string> {
  if (!IS_WEB) {
    return 'https://console.onefleet.hk';
  }

  // 優先使用環境變數（Cloudflare Worker URL）
  const envProxyUrl = process.env.EXPO_PUBLIC_GPS_PROXY_URL;
  if (envProxyUrl) {
    // 確保格式一致
    const baseUrl = envProxyUrl.replace(/\/$/, '');
    return baseUrl.endsWith('/api/gps') ? baseUrl : `${baseUrl}/api/gps`;
  }

  // Web 端：若當前頁面是 localhost / 127.0.0.1，強制走本機 proxy port，
  // 避免 expo metro dev server 攔截 /api/gps 路由造成 400/404。
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return `http://localhost:${PROXY_PORT}/api/gps`;
    }
  }

  // 其他 host（LAN，無 env）：使用 storage 或 origin 拼接
  const stored = await getWebStoredServerUrl();
  if (stored) {
    return stored.replace(/\/$/, '');
  }
  return getWebBaseUrl();
}

export async function setServerUrl(url: string): Promise<void> {
  // 在 Vercel 環境下，不應該存儲 localhost URL
  const isVercel = typeof window !== 'undefined' &&
    (window.location?.hostname?.includes('vercel.app') ||
     process.env.VERCEL === '1');

  // 清理 localhost URL（從本地開發遺留）
  if (isVercel && url.includes('localhost')) {
    runtimeServerUrl = null;
    await storage.removeItem(SERVER_URL_KEY);
    return;
  }

  runtimeServerUrl = url.replace(/\/$/, '');
  await storage.setItem(SERVER_URL_KEY, runtimeServerUrl);
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
  jn?: string;               // driver job
  /** When lat/lng are both 0, this contains the status code (e.g., 1 = offline) */
  gpsS?: number | string;
  /** Number of video channels supported by the device (e.g., 4 for VL-6012, 6 for others) */
  ChanNum?: number | string;
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
  // Headers may be a Headers object or a plain object on web.
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
    console.log('[GPS808] login() 開始');
    console.log('[GPS808] 使用 base URL:', base);
    console.log('[GPS808] 帳號:', account);
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      };

      // 808GPS API requires MD5 encrypted password via password parameter
      // 注意：如果密碼已經是 32 字元的 MD5 格式（由 relogin 傳入），則不再加密
      const isAlreadyEncrypted = /^[a-f0-9]{32}$/i.test(password);
      const encryptedPassword = isAlreadyEncrypted ? password : md5(password);
      console.log('[GPS808] 密碼已加密:', isAlreadyEncrypted ? '是 (MD5)' : '否 (將加密)');

      const url = `${base}/StandardApiAction_login.action`;
      console.log('[GPS808] 登入 URL:', url);
      
      const body = new URLSearchParams({ account, password: encryptedPassword }).toString();
      console.log('[GPS808] 請求 body:', body.replace(/password=[^&]+/, 'password=***'));
      
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        ...(IS_WEB ? {} : { credentials: 'include' }),
      });

      console.log('[GPS808] 響應狀態:', res.status);
      console.log('[GPS808] 響應 headers:', Array.from(res.headers.entries()));
      console.log('[GPS808] 響應 content-type:', res.headers.get('content-type'));
      
      // 首先獲取響應文本
      const text = await res.text();
      console.log('[GPS808] 響應內容 (前500字):', text.substring(0, 500));

      // 嘗試從 JSON 響應中提取 session（proxy 會在 JSON 中返回 _proxySession）
      let jsession: string | undefined;
      let jsonResponse: Record<string, unknown> | null = null;

      try {
        jsonResponse = JSON.parse(text);
        console.log('[GPS808] JSON 解析成功, result:', (jsonResponse as any).result);
        // 從 proxy 返回的 JSON 中提取 session
        if (jsonResponse && typeof jsonResponse === 'object') {
          // 支援 _proxySession (新格式) 和 jsession (直接返回)
          const proxySession = (jsonResponse as Record<string, unknown>)._proxySession;
          const directJsession = (jsonResponse as Record<string, unknown>).jsession;
          if (proxySession) {
            jsession = proxySession as string;
            console.log('[GPS808] 從 _proxySession 獲取 session:', jsession?.substring(0, 16) + '...');
          } else if (directJsession) {
            jsession = directJsession as string;
            console.log('[GPS808] 從 jsession 獲取 session:', jsession?.substring(0, 16) + '...');
          }
          
          // 檢查登入結果
          const resultCode = (jsonResponse as Record<string, unknown>).result;
          console.log('[GPS808] 登入結果 code:', resultCode);
          if (resultCode !== 0) {
            console.log('[GPS808] 登入失敗, 錯誤訊息:', (jsonResponse as Record<string, unknown>).message);
          }
        }
      } catch (e) {
        console.warn('[GPS808] JSON 解析失敗, 原始內容:', text.substring(0, 200));
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
        console.log('[GPS808] 檢測到 result:0 但無 session');
        return { success: true, error: 'Login OK but no session received' };
      }

      console.log('[GPS808] 登入失敗: Invalid credentials 或網路錯誤');
      return { success: false, error: `Invalid credentials (HTTP ${res.status})` };
    } catch (err) {
      console.error('[GPS808] 網路錯誤:', err);
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
      resetServerUrlCache();
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
        // 除錯：列印原始 status 物件以便驗證 lat/lng 格式
        // eslint-disable-next-line no-console
        console.log('[gps808Api.getDeviceStatus] raw status[0]:', firstStatus);
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
   * Get the number of video channels supported by a device.
   * Returns the ChanNum from device status, with a sensible default fallback.
   * Most devices support 4 channels (VL-6012), some support 6 channels.
   */
  async getDeviceChannelCount(devIdno: string): Promise<number> {
    try {
      const res = await this.getDeviceStatus(devIdno, false);
      if (res.result === 0 && res.status) {
        const chanNum = res.status.ChanNum;
        if (chanNum !== undefined && chanNum !== null && chanNum !== '') {
          const parsed = typeof chanNum === 'string' ? parseInt(chanNum, 10) : chanNum;
          if (!isNaN(parsed) && parsed > 0) {
            return parsed;
          }
        }
      }
    } catch (err) {
      console.warn('[GPS808] Failed to get device channel count:', err);
    }
    // Default to 4 channels if unable to determine
    return 4;
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
   * Check current session validity for VIDEO API
   * Uses the same endpoint as proxy's validateSession for consistency
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
      // 使用影像設備查詢 API 來驗證 session（與代理保持一致）
      const res = await fetch(
        `${base}/StandardApiAction_getVideoDevice.action?devIdno=018270193745`,
        { headers },
      );
      if (!res.ok) return false;
      const json = await res.json() as { result?: number };
      // result=0 表示有影像權限，result=8 表示無權限
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

  /**
   * 即時影像 URL（PC/mobile 直接嵌入用）
   * 用於 WebView / iframe 嵌入即時影像串流。
   *
   * Live Video (PC/mobile URL) — sec-video-live-html
   * 文件：`https://console.onefleet.hk/StandardApiAction_getVideoUrl.action`
   *
   * @param devIdno 設備號（devIdno）
   * @param options.channel 通道號（預設 0）
   * @param options.stream 碼流（預設 0=主碼流/高清, 1=子碼流/標清）
   * @param options.type 類型（預設 1=即時影像）
   * @param options.quality 畫質（sd=標清, hd=高清）
   * @param options.protocol 串流協議（flv=HTTP-FLV, hls=HLS, auto=自動）
   * @param options.ip 伺服器 IP（可選，若留空則由後端解析）
   * @param options.port 伺服器 Port（可選，若留空則由後端解析）
   */
  async getLiveVideoUrl(
    devIdno: string,
    options?: {
      channel?: number;
      stream?: number;
      type?: number;
      quality?: 'sd' | 'hd';
      protocol?: 'flv' | 'hls' | 'auto';
      ip?: string;
      port?: string;
    },
  ): Promise<{
    result: number;
    videoUrl?: string;
    flvUrl?: string;
    hlsUrl?: string;
    error?: string;
  }> {
    // 畫質對應串流參數
    // stream=0: 主碼流 (HD/高清, ~4Mbps)
    // stream=1: 子碼流 (SD/標清, ~1.5Mbps)
    const stream = options?.quality === 'sd' ? 1 : (options?.stream ?? 0);
    const protocol = options?.protocol ?? 'flv';
    const channel = options?.channel ?? 0;

    const params: Record<string, string | number> = {
      devIdno,
      channel,
      stream,
      type: options?.type ?? 1,
    };
    if (options?.ip) params.ip = options.ip;
    if (options?.port) params.port = options.port;

    const jsession = await storage.getItem(JSESSION_KEY);
    if (jsession) params.jsessionId = jsession;

    // 構建 URL 參數
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => searchParams.set(k, String(v)));
    const queryString = searchParams.toString();

    // 808GPS 服務器 URL
    const baseUrl = 'https://console.onefleet.hk';

    // 根據 808GPS 官方文檔，即時影像 URL 格式：
    // HLS: http://console.onefleet.hk:6604/hls/1_{devIdno}_{channel}_{stream}.m3u8?jsession={jsession}
    // FLV/HTTP-FLV: http://console.onefleet.hk:6604/3/3?AVType=1&jsession=...&DevIDNO=...&Channel=...&Stream=...
    // 透過 Web 代理打通 CORS
    const hlsUrl = jsession
      ? `http://console.onefleet.hk:6604/hls/1_${devIdno}_${channel}_${stream}.m3u8?jsession=${jsession}`
      : `http://console.onefleet.hk:6604/hls/1_${devIdno}_${channel}_${stream}.m3u8`;
    const flvUrl = jsession
      ? `http://console.onefleet.hk:6604/3/3?AVType=1&jsession=${jsession}&DevIDNO=${devIdno}&Channel=${channel}&Stream=${stream}`
      : `http://console.onefleet.hk:6604/3/3?AVType=1&DevIDNO=${devIdno}&Channel=${channel}&Stream=${stream}`;

    // 構建 proxy base URL
    const proxyBase = getWebBaseUrl().replace(/\/api\/gps$/, '');

    // Web 端：始終使用 Cloudflare Worker proxy URL
    if (IS_WEB) {
      // 直接構建 proxy URL（避免 fetch 失敗時返回不安全的 HTTP URL）
      const streamPath = protocol === 'hls' ? 'hls-stream' : 'flv-stream';
      const proxyFlvUrl = `${proxyBase}/api/gps/${streamPath}?devIdno=${devIdno}&channel=${channel}&stream=${stream}${jsession ? `&jsessionId=${jsession}` : ''}`;
      const proxyHlsUrl = `${proxyBase}/api/gps/hls-stream?devIdno=${devIdno}&channel=${channel}&stream=${stream}${jsession ? `&jsessionId=${jsession}` : ''}`;

      return {
        result: 0,
        videoUrl: proxyFlvUrl,
        flvUrl: proxyFlvUrl,
        hlsUrl: proxyHlsUrl,
      };
    }

    // 原生端直接使用影像 URL（依據 808GPS 官方文檔格式）
    const nativeFlvUrl = `${baseUrl}/3/3?${queryString}&AVType=1`;
    const nativeHlsUrl = `${baseUrl}/hlslive/?${queryString}&AVType=1`;

    // 根據協議返回 URL
    if (protocol === 'flv') {
      return {
        result: 0,
        videoUrl: nativeFlvUrl,
        flvUrl: nativeFlvUrl,
        hlsUrl: nativeHlsUrl,
      };
    }

    if (protocol === 'hls') {
      return {
        result: 0,
        videoUrl: nativeHlsUrl,
        flvUrl: nativeFlvUrl,
        hlsUrl: nativeHlsUrl,
      };
    }

    // auto 模式：返回 HTTP-FLV URL
    return {
      result: 0,
      videoUrl: nativeFlvUrl,
      flvUrl: nativeFlvUrl,
      hlsUrl: nativeHlsUrl,
    };
  },

  /**
   * 截圖（影像快照）
   * 即時向設備發送截圖指令，返回截圖圖片 URL。
   *
   * @param devIdno 設備號
   * @param options.channel 通道號（預設 0）
   * @param options.resolution 解析度（預設 1）
   */
  capturePicture(
    devIdno: string,
    options?: { channel?: number; resolution?: number },
  ): Promise<{ result: number; pictureUrl?: string; error?: string }> {
    return apiCall<{ Picture_Path?: string }>(
      '/StandardApiAction_capturePicture.action',
      {
        devIdno,
        channel: options?.channel ?? 0,
        resolution: options?.resolution ?? 1,
      },
    ).then((res) => {
      if (res.result === 0) {
        return {
          result: 0,
          pictureUrl: res.infos?.[0]?.Picture_Path,
        };
      }
      return { result: res.result, error: res.error };
    });
  },

  /**
   * 查詢錄像文件列表
   * 
   * 用於查詢指定設備、指定日期的錄像文件資訊。
   * 
   * @param devIdno 設備號
   * @param options.year 年份 (如 2026)
   * @param options.month 月份 (1-12)
   * @param options.day 日期 (1-31)
   * @param options.channel 通道號 (0-5)
   * @param options.beg 開始秒數 (0-86399)
   * @param options.end 結束秒數 (0-86399)
   * @param options.recType 錄像類型 (-1=全部, 0=一般, 1=報警)
   * @param options.store 存儲位置 (1=設備, 2=服務器)
   */
  queryVideoFileInfo(
    devIdno: string,
    options: {
      year: number;
      month: number;
      day: number;
      channel: number;
      beg?: number;
      end?: number;
      recType?: number;
      store?: number;
    },
  ): Promise<{
    result: number;
    videoFiles?: VideoFileInfo[];
    error?: string;
  }> {
    const params: Record<string, string | number> = {
      DevIDNO: devIdno,
      CHN: options.channel,
      YEAR: options.year,
      MON: options.month,
      DAY: options.day,
      BEG: options.beg ?? 0,
      END: options.end ?? 86399,
      RECTYPE: options.recType ?? -1,
      FILEATTR: 2,
      ARM1: 0,
      ARM2: 0,
      RES: 0,
      STREAM: 0,
      STORE: options.store ?? 2,
    };

    return apiCall<VideoFileInfo>('/StandardApiAction_getVideoFileInfo.action', params).then((res) => {
      if (res.result === 0) {
        return { result: 0, videoFiles: res.infos ?? [] };
      }
      return { result: res.result, error: res.error };
    });
  },

  /**
   * 查詢歷史錄像文件列表（跨日期範圍）
   * 
   * @param devIdno 設備號
   * @param options.year 開始年份
   * @param options.month 開始月份
   * @param options.day 開始日期
   * @param options.yearE 結束年份
   * @param options.monthE 結束月份
   * @param options.dayE 結束日期
   * @param options.channel 通道號
   * @param options.recType 錄像類型
   * @param options.store 存儲位置 (1=設備, 2=服務器)
   */
  queryVideoHistoryFile(
    devIdno: string,
    options: {
      year: number;
      month: number;
      day: number;
      yearE: number;
      monthE: number;
      dayE: number;
      channel: number;
      beg?: number;
      end?: number;
      recType?: number;
      store?: number;
    },
  ): Promise<{
    result: number;
    videoFiles?: VideoFileInfo[];
    error?: string;
  }> {
    const params: Record<string, string | number> = {
      DevIDNO: devIdno,
      CHN: options.channel,
      YEAR: options.year,
      MON: options.month,
      DAY: options.day,
      YEARE: options.yearE,
      MONE: options.monthE,
      DAYE: options.dayE,
      BEG: options.beg ?? 0,
      END: options.end ?? 86399,
      RECTYPE: options.recType ?? -1,
      FILEATTR: 2,
      ARM1: 0,
      ARM2: 0,
      RES: 0,
      STREAM: 0,
      STORE: options.store ?? 2,
    };

    return apiCall<VideoFileInfo>('/StandardApiAction_getVideoHistoryFile.action', params).then((res) => {
      if (res.result === 0) {
        return { result: 0, videoFiles: res.infos ?? [] };
      }
      return { result: res.result, error: res.error };
    });
  },

  /**
   * 新增錄像下載任務
   * 
   * 將錄像下載到服務器，然後可以通過 downloadUrl 下載。
   * 
   * @param devIdno 設備號
   * @param options.fileBeginTime 檔案開始時間 (YYYY-MM-DD HH:mm:ss)
   * @param options.fileEndTime 檔案結束時間 (YYYY-MM-DD HH:mm:ss)
   * @param options.serverBeginTime 服務器開始時間 (YYYY-MM-DD HH:mm:ss)
   * @param options.serverEndTime 服務器結束時間 (YYYY-MM-DD HH:mm:ss)
   * @param options.filePath 檔案路徑 (從 queryVideoFileInfo 取得)
   * @param options.videoType 視頻類型
   * @param options.fileLength 檔案大小 (bytes)
   * @param options.channel 通道號
   * @param options.label 任務標籤
   */
  addDownloadTask(
    devIdno: string,
    options: {
      fileBeginTime: string;
      fileEndTime: string;
      serverBeginTime: string;
      serverEndTime: string;
      filePath: string;
      videoType?: number;
      fileLength: number;
      channel: number;
      label?: string;
    },
  ): Promise<{
    result: number;
    taskId?: string;
    downloadUrl?: string;
    error?: string;
  }> {
    const params: Record<string, string | number> = {
      did: devIdno,
      fbtm: options.fileBeginTime,
      fetm: options.fileEndTime,
      sbtm: options.serverBeginTime,
      setm: options.serverEndTime,
      fph: options.filePath,
      vtp: options.videoType ?? 1,
      len: options.fileLength,
      chn: options.channel,
      dtp: 1, // 1=分段下載（先下載到服務器）
      lab: options.label ?? '',
    };

    return apiCall<{ TaskID?: string; DownUrl?: string }>(
      '/StandardApiAction_addDownloadTask.action',
      params,
    ).then((res) => {
      if (res.result === 0 && res.infos && res.infos.length > 0) {
        return {
          result: 0,
          taskId: res.infos[0].TaskID,
          downloadUrl: res.infos[0].DownUrl,
        };
      }
      return { result: res.result, error: res.error };
    });
  },

  /**
   * 查詢下載任務列表
   */
  queryDownloadTaskList(): Promise<{
    result: number;
    tasks?: DownloadTask[];
    error?: string;
  }> {
    return apiCall<DownloadTask>('/StandardApiAction_downloadTasklist.action', {}).then((res) => {
      if (res.result === 0) {
        return { result: 0, tasks: res.infos ?? [] };
      }
      return { result: res.result, error: res.error };
    });
  },

  /**
   * 刪除下載任務
   * 
   * @param taskId 任務 ID
   */
  deleteDownloadTask(taskId: string): Promise<{ result: number; error?: string }> {
    return apiCall('/StandardApiAction_delDownloadTasklist.action', { id: taskId }).then((res) => ({
      result: res.result,
      error: res.error,
    }));
  },

  /**
   * 控制下載任務（暫停/繼續/取消）
   * 
   * @param taskId 任務 ID
   * @param action 動作 (0=取消, 1=繼續, 2=暫停)
   */
  controlDownloadTask(
    taskId: string,
    action: 0 | 1 | 2,
  ): Promise<{ result: number; error?: string }> {
    return apiCall('/StandardApiAction_controllDownLoad.action', {
      id: taskId,
      action,
    }).then((res) => ({
      result: res.result,
      error: res.error,
    }));
  },
};

/** 錄像文件資訊 */
export interface VideoFileInfo {
  /** 檔案名稱 */
  name?: string;
  /** 檔案路徑 */
  filePath?: string;
  /** 通道號 */
  chn?: number;
  /** 開始時間 (Unix timestamp ms) */
  beginTime?: number;
  /** 結束時間 (Unix timestamp ms) */
  endTime?: number;
  /** 檔案大小 (bytes) */
  fileSize?: number;
  /** 錄像類型 */
  recType?: number;
  /** 存儲位置 */
  store?: number;
  /** 設備 ID */
  devId?: string;
  /** 檔案 ID */
  fileId?: string;
  /** 下載 URL */
  downUrl?: string;
  /** 播放 URL */
  playUrl?: string;
  /** 是否正在錄製 */
  isRecording?: boolean;
  /** 媒體類型 */
  mediaType?: number;
}

/** 下載任務資訊 */
export interface DownloadTask {
  /** 任務 ID */
  id?: string;
  TaskID?: string;
  /** 設備號 */
  devIdno?: string;
  /** 設備 ID */
  did?: string;
  /** 任務狀態 (0=暫停, 1=下載中, 2=取消, 3=失敗, 4=成功) */
  taskStatus?: number;
  /** 下載進度 (0-100) */
  uploadProgress?: number;
  /** 下載速度 (bytes/秒) */
  uploadSpeed?: number;
  /** 用戶 ID */
  userID?: number;
  /** 任務創建時間 */
  taskSTime?: number;
  /** 任務結束時間 */
  taskETime?: number;
  /** 下載連結 */
  DownUrl?: string;
  downloadUrl?: string;
  /** 檔案路徑 */
  filePath?: string;
  /** 檔案名稱 */
  fileName?: string;
  /** 檔案大小 (bytes) */
  fileSize?: number;
  /** 估計檔案大小 */
  estimateFileSize?: number;
  /** 開始時間 */
  beginTime?: string;
  /** 結束時間 */
  endTime?: string;
  /** 下載路徑 */
  downPath?: string;
  /** 失敗原因 */
  failReason?: string;
  /** 下載類型 */
  downType?: number;
  /** 通道號 */
  channel?: number;
}
