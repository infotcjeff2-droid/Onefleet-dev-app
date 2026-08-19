/**
 * GPS 連線診斷與重置工具
 *
 * 用途：
 *   「無痕可以、一般不行」幾乎都和瀏覽器持久狀態有關
 *   （Service Worker / localStorage / Cache Storage / module-level cache）。
 *   這個工具提供：
 *     1. 診斷：列出所有 GPS 相關的快取與狀態
 *     2. 重置：一鍵清掉所有會干擾連線的本地狀態
 *     3. 重新連線：使用雲端/本地儲存的帳密重新登入
 */

import { Platform } from 'react-native';
import { storage } from './storage';
import {
  gps808Api,
  resetServerUrlCache,
  getWebProxyBaseUrlSync,
  getRuntimeServerUrl,
} from './gps808Api';

const JSESSION_KEY = 'gps808_jsession';
const SERVER_URL_KEY = 'gps808_server_url';
const JSESSION_USER_KEY = 'gps808_jsession_user';

export interface GpsDiagnosticInfo {
  /** 目前 module-level 快取的 server URL（如果有的話） */
  runtimeServerUrl: string | null;
  /** 從 localStorage 讀出的 server URL */
  storedServerUrl: string | null;
  /** 透過解析規則計算出的 proxy URL（也就是 fetch 真正會用的 URL） */
  effectiveProxyUrl: string;
  /** 測試 proxy 是否可達（真實網路請求） */
  proxyTest: { ok: boolean; status: number; error?: string };
  /** localStorage 中是否有 jsession */
  hasJsession: boolean;
  /** jsession 字串前 16 碼（方便判斷過期/格式） */
  jsessionPreview: string | null;
  /** localStorage 中是否有 user 標記 */
  hasSessionUser: boolean;
  /** Service Worker 數量（web only） */
  serviceWorkerCount: number;
  /** Cache Storage 中的 cache 名稱（web only） */
  cacheStorageNames: string[];
  /** localStorage 中所有包含 'gps' 或 '808' 的 key */
  relatedLocalStorageKeys: string[];
  /** 瀏覽器目前 user agent */
  userAgent: string;
  /** 是否在線（瀏覽器 navigator.onLine） */
  isOnline: boolean;
}

export interface GpsClearResult {
  clearedItems: string[];
  unregisteredServiceWorkers: number;
  deletedCaches: number;
}

/**
 * 收集目前 GPS 相關的所有快取狀態（不做任何修改）
 */
export async function diagnoseGpsConnection(): Promise<GpsDiagnosticInfo> {
  const isWeb = Platform.OS === 'web';

  // Module-level runtime cache（在 gps808Api 內）
  const runtimeServerUrl = getRuntimeServerUrl();

  // 從 storage 讀
  const storedServerUrl = await storage.getItem(SERVER_URL_KEY);
  const jsession = await storage.getItem(JSESSION_KEY);
  const sessionUser = await storage.getItem(JSESSION_USER_KEY);

  // 計算 effective URL（真正 fetch 用的）
  let effectiveProxyUrl = '(unknown)';
  try {
    effectiveProxyUrl = getWebProxyBaseUrlSync();
  } catch {
    // ignore
  }

  // Web 專屬：列出 SW / Cache / 相關 localStorage keys
  let serviceWorkerCount = 0;
  let cacheStorageNames: string[] = [];
  let relatedLocalStorageKeys: string[] = [];
  let userAgent = '';
  let isOnline = true;

  if (isWeb && typeof window !== 'undefined') {
    userAgent = window.navigator?.userAgent ?? '';
    isOnline = window.navigator?.onLine ?? true;

    // Service Workers
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        serviceWorkerCount = regs.length;
      } catch {
        serviceWorkerCount = 0;
      }
    }

    // Cache Storage
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        cacheStorageNames = keys;
      } catch {
        cacheStorageNames = [];
      }
    }

    // localStorage keys（含 gps / 808 / jsession）
    try {
      const allKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) allKeys.push(k);
      }
      relatedLocalStorageKeys = allKeys.filter((k) =>
        /gps|808|jsession|server.?url/i.test(k),
      );
    } catch {
      relatedLocalStorageKeys = [];
    }
  }

  return {
    runtimeServerUrl,
    storedServerUrl,
    effectiveProxyUrl,
    proxyTest: await testProxyReachability(effectiveProxyUrl),
    hasJsession: !!jsession,
    jsessionPreview: jsession ? jsession.substring(0, 16) + '...' : null,
    hasSessionUser: !!sessionUser,
    serviceWorkerCount,
    cacheStorageNames,
    relatedLocalStorageKeys,
    userAgent,
    isOnline,
  };
}

/**
 * 一鍵清掉所有會干擾 GPS 連線的本地狀態
 */
export async function clearGpsConnectionCache(): Promise<GpsClearResult> {
  const clearedItems: string[] = [];
  const isWeb = Platform.OS === 'web';

  // 1. 清掉 module-level cache（gps808Api.ts 內的 runtimeServerUrl）
  try {
    resetServerUrlCache();
    clearedItems.push('module runtimeServerUrl cache');
  } catch (e) {
    console.warn('[GPS Diagnostics] Failed to reset module cache:', e);
  }

  // 2. 清掉 storage 中的 GPS 相關 key
  try {
    await storage.removeItem(JSESSION_KEY);
    clearedItems.push(`storage: ${JSESSION_KEY}`);
  } catch (e) {
    console.warn('[GPS Diagnostics] Failed to remove jsession:', e);
  }
  try {
    await storage.removeItem(JSESSION_USER_KEY);
    clearedItems.push(`storage: ${JSESSION_USER_KEY}`);
  } catch (e) {
    console.warn('[GPS Diagnostics] Failed to remove jsession_user:', e);
  }
  try {
    await storage.removeItem(SERVER_URL_KEY);
    clearedItems.push(`storage: ${SERVER_URL_KEY}`);
  } catch (e) {
    console.warn('[GPS Diagnostics] Failed to remove server_url:', e);
  }

  // 3. 清掉所有包含 gps / 808 / jsession 的 localStorage key（包含獨立的）
  if (isWeb && typeof window !== 'undefined') {
    try {
      const allKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) allKeys.push(k);
      }
      const targets = allKeys.filter((k) =>
        /gps|808|jsession|server.?url/i.test(k),
      );
      for (const k of targets) {
        try {
          localStorage.removeItem(k);
        } catch {
          // ignore
        }
      }
      if (targets.length > 0) {
        clearedItems.push(`localStorage 掃描清理 (${targets.length} keys)`);
      }
    } catch (e) {
      console.warn('[GPS Diagnostics] Failed to scan localStorage:', e);
    }
  }

  // 4. 取消所有 Service Worker（這是最常見的「無痕可以、一般不行」原因）
  let unregisteredServiceWorkers = 0;
  if (isWeb && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        try {
          const ok = await reg.unregister();
          if (ok) unregisteredServiceWorkers++;
        } catch {
          // ignore
        }
      }
      if (unregisteredServiceWorkers > 0) {
        clearedItems.push(`Service Worker (${unregisteredServiceWorkers} 個已取消註冊)`);
      }
    } catch (e) {
      console.warn('[GPS Diagnostics] Failed to unregister SW:', e);
    }
  }

  // 5. 清掉 Cache Storage（避免舊的 m3u8 / API response 殘留）
  let deletedCaches = 0;
  if (isWeb && typeof window !== 'undefined' && 'caches' in window) {
    try {
      const keys = await caches.keys();
      for (const key of keys) {
        try {
          const ok = await caches.delete(key);
          if (ok) deletedCaches++;
        } catch {
          // ignore
        }
      }
      if (deletedCaches > 0) {
        clearedItems.push(`Cache Storage (${deletedCaches} 個已刪除)`);
      }
    } catch (e) {
      console.warn('[GPS Diagnostics] Failed to clear caches:', e);
    }
  }

  return {
    clearedItems,
    unregisteredServiceWorkers,
    deletedCaches,
  };
}

/**
 * 直接測試 proxy 是否能正常回應（不依賴 jsession）
 */
export async function testProxyReachability(
  baseUrl: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const url = `${baseUrl}/StandardApiAction_login.action`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'account=_diag_&password=_diag_',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      // 任何 HTTP 回應（即使 400/401）都表示 proxy活著
      // 只有 network error / timeout 才算失敗
      return { ok: true, status: res.status };
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        return { ok: false, status: 0, error: '連線逾時（8秒）' };
      }
      return { ok: false, status: 0, error: String(fetchErr) };
    }
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}
