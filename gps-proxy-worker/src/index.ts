/**
 * Cloudflare Worker - GPS Proxy
 * 
 * 處理所有 GPS API 請求，轉發到 console.onefleet.hk
 * 支援 CORS 和視頻串流
 */

const GPS_SERVER = 'console.onefleet.hk';
const GPS_VIDEO_PORT = '6604';

// 管理員登入配置（用於影像功能）
const ADMIN_ACCOUNT = 'admin';
const ADMIN_PASSWORD_MD5 = '4FF4C011268967DF32B6253CA0E7BDF0'; // MD5 of (hi2F/&}G2b9

// KV 中的 session 鍵名
const KV_SESSION_KEY = 'admin_session';
// Session 有效期 30 分鐘
const SESSION_TTL_SECONDS = 30 * 60;

interface Env {
  GPS_SESSIONS: KVNamespace;
}

// 測試模式標誌（當 KV 未綁定時使用內存緩存）
let useMemoryCache = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-gps-jsession, Cookie, Origin, Accept, Accept-Language',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers': 'Set-Cookie, JSESSIONID',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    console.log(`[GPS Proxy] ${method}: ${pathname}`);

    // 測試 KV 是否可用
    if (env.GPS_SESSIONS) {
      useMemoryCache = false;
    } else {
      useMemoryCache = true;
      console.log('[GPS Proxy] KV not available, using memory cache');
    }

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ============ 處理 FLV 串流 ============
    if (pathname.includes('/flv-stream')) {
      return handleFlvStream(request, url, env);
    }

    // ============ 處理 HLS m3u8 ============
    if (pathname.includes('/hls-stream')) {
      return handleHlsStream(request, url, env);
    }

    // ============ 處理 HLS TS 分段 ============
    if (pathname.includes('/hls-segment')) {
      return handleHlsSegment(request, url, env);
    }

    // ============ 處理視頻 URL ============
    if (pathname.includes('/video-url')) {
      return handleVideoUrl(request, url);
    }

    // ============ 測試端點 ============
    if (pathname === '/test' || pathname === '/api/test') {
      return new Response(JSON.stringify({
        status: 'ok',
        kv_available: !useMemoryCache,
        server: GPS_SERVER,
        timestamp: new Date().toISOString(),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ============ 其他：JSON API ============
    return handleJsonApi(request, url);
  },
};

// ============ Admin Session 管理 ============

/**
 * 登入並獲取 admin session
 */
async function loginAdminSession(): Promise<string | null> {
  try {
    // 808GPS 登入端點格式（與本地代理一致）
    const loginUrl = `https://${GPS_SERVER}/StandardApiAction_login.action`;
    const body = `account=${ADMIN_ACCOUNT}&password=${ADMIN_PASSWORD_MD5}`;

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const text = await response.text();
    console.log('[GPS Proxy] Admin login response:', text.substring(0, 200));

    try {
      const json = JSON.parse(text);
      if (json.result === 0 && json.jsession) {
        console.log('[GPS Proxy] Admin login success');
        return json.jsession;
      }
    } catch (e) {
      console.error('[GPS Proxy] Failed to parse login response:', e);
    }

    return null;
  } catch (error) {
    console.error('[GPS Proxy] Admin login error:', error);
    return null;
  }
}

/**
 * 獲取有效的 admin session（使用 KV 或內存緩存）
 */
async function getValidAdminSession(env: Env): Promise<string | null> {
  // 嘗試從 KV 讀取
  if (!useMemoryCache && env.GPS_SESSIONS) {
    try {
      const cached = await env.GPS_SESSIONS.get(KV_SESSION_KEY, 'json') as { session: string; timestamp: number } | null;
      if (cached) {
        const age = (Date.now() - cached.timestamp) / 1000;
        if (age < SESSION_TTL_SECONDS) {
          console.log('[GPS Proxy] Using KV cached session, age:', Math.round(age), 'seconds');
          return cached.session;
        }
        console.log('[GPS Proxy] KV session expired, age:', Math.round(age), 'seconds');
      }
    } catch (e) {
      console.error('[GPS Proxy] KV read error:', e);
    }
  }

  // 獲取新 session
  console.log('[GPS Proxy] Getting new admin session...');
  const newSession = await loginAdminSession();

  if (newSession) {
    // 保存到 KV
    if (!useMemoryCache && env.GPS_SESSIONS) {
      try {
        await env.GPS_SESSIONS.put(KV_SESSION_KEY, JSON.stringify({
          session: newSession,
          timestamp: Date.now(),
        }), { expirationTtl: SESSION_TTL_SECONDS });
        console.log('[GPS Proxy] Session saved to KV');
      } catch (e) {
        console.error('[GPS Proxy] KV write error:', e);
      }
    }
  }

  return newSession;
}

// ============ FLV 串流處理 ============
async function handleFlvStream(request: Request, url: URL, env: Env): Promise<Response> {
  const devIdno = url.searchParams.get('devIdno') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '0';

  if (!devIdno) {
    return new Response('Missing devIdno parameter', { status: 400 });
  }

  // 始終使用 admin session（用戶端 session 沒有影像權限）
  const jsessionId = await getValidAdminSession(env);
  if (!jsessionId) {
    return new Response(JSON.stringify({
      error: '無法獲取有效 session，請重試',
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const flvUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/3/3?AVType=1&jsession=${encodeURIComponent(jsessionId)}&DevIDNO=${encodeURIComponent(devIdno)}&Channel=${channel}&Stream=${stream}`;

  console.log('[GPS Proxy] FLV URL:', flvUrl);

  try {
    // 使用流式轉發，不等待完整數據
    const response = await fetch(flvUrl, {
      headers: {
        'Accept': 'video/x-flv, application/octet-stream, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const status = response.status;
    const contentType = response.headers.get('content-type') || '';

    // 流式轉發 FLV 數據
    if (response.body) {
      console.log('[GPS Proxy] Streaming FLV response, status:', status);
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'video/x-flv',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // 如果沒有 body，返回錯誤
    console.error('[GPS Proxy] No response body from FLV server');
    return new Response(JSON.stringify({
      error: 'No response body from video server',
      status,
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[GPS Proxy] FLV fetch error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch FLV stream',
      message: String(error),
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ============ HLS m3u8 處理 ============
async function handleHlsStream(request: Request, url: URL, env: Env): Promise<Response> {
  const devIdno = url.searchParams.get('devIdno') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '0';

  if (!devIdno) {
    return new Response('Missing devIdno parameter', { status: 400 });
  }

  // 始終使用 admin session
  const jsessionId = await getValidAdminSession(env);
  if (!jsessionId) {
    return new Response(JSON.stringify({
      error: '無法獲取有效 session，請重試',
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 808GPS HLS URL 格式
  const hlsUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/hls/1_${devIdno}_${channel}_${stream}.m3u8?jsession=${encodeURIComponent(jsessionId)}`;

  console.log('[GPS Proxy] HLS URL:', hlsUrl);

  try {
    const response = await fetch(hlsUrl, {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const text = await response.text();

    // 檢查是否返回 m3u8
    if (!text.includes('#EXTM3U') && !text.includes('#EXT-X-STREAM-INF')) {
      console.error('[GPS Proxy] Not HLS content:', text.substring(0, 300));
      return new Response(JSON.stringify({
        error: 'Video server returned non-HLS content',
        preview: text.substring(0, 300),
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[GPS Proxy] HLS fetch error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch HLS stream',
      message: String(error),
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ============ HLS TS 分段處理 ============
async function handleHlsSegment(request: Request, url: URL, env: Env): Promise<Response> {
  const segmentUrl = url.searchParams.get('url') || '';
  const jsessionId = url.searchParams.get('jsessionId') || '';

  if (!segmentUrl) {
    return new Response('Missing segment URL', { status: 400 });
  }

  // 始終使用 admin session
  const adminSession = await getValidAdminSession(env);
  const sessionToUse = adminSession || jsessionId;

  // 將 session 添加到分段 URL
  let fullUrl = segmentUrl;
  if (sessionToUse) {
    fullUrl += (segmentUrl.includes('?') ? '&' : '?') + `jsession=${encodeURIComponent(sessionToUse)}`;
  }

  console.log('[GPS Proxy] HLS segment URL:', fullUrl);

  try {
    const response = await fetch(fullUrl);
    const buffer = await response.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[GPS Proxy] HLS segment error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch HLS segment',
      message: String(error),
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ============ 視頻 URL 獲取 ============
async function handleVideoUrl(request: Request, url: URL): Promise<Response> {
  const devIdno = url.searchParams.get('devIdno') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '0';

  if (!devIdno) {
    return new Response(JSON.stringify({ error: 'Missing devIdno' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const proxyBase = `https://${new URL(request.url).hostname}`;

  return new Response(JSON.stringify({
    result: 0,
    videoUrl: `${proxyBase}/flv-stream?devIdno=${devIdno}&channel=${channel}&stream=${stream}`,
    flvUrl: `${proxyBase}/flv-stream?devIdno=${devIdno}&channel=${channel}&stream=${stream}`,
    hlsUrl: `${proxyBase}/hls-stream?devIdno=${devIdno}&channel=${channel}&stream=${stream}`,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ============ JSON API 處理 ============
async function handleJsonApi(request: Request, url: URL): Promise<Response> {
  const pathname = url.pathname;
  const searchParams = url.searchParams;

  // 構建目標 URL
  let targetPath = pathname;
  // 去掉 /api/gps 前綴，映射到 GPS 服務器根路徑
  if (pathname.startsWith('/api/gps/')) {
    targetPath = pathname.slice('/api/gps'.length) || '/';
  } else if (pathname === '/api/gps' || pathname === '/api/gps/') {
    targetPath = '/';
  }
  const targetUrl = `http://${GPS_SERVER}${targetPath}${url.search}`;
  const method = request.method;

  console.log(`[GPS Proxy] Proxying ${method}: ${targetUrl}`);

  // 提取 session（從 cookie 或 header）
  let sessionId = '';
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieMatch = cookieHeader.match(/JSESSIONID=([^;]+)/);
  if (cookieMatch) {
    sessionId = cookieMatch[1];
  } else {
    sessionId = request.headers.get('x-gps-jsession') || '';
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': request.headers.get('Content-Type') || 'application/json',
      'Accept': 'application/json, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (sessionId) {
      headers['Cookie'] = `JSESSIONID=${sessionId}`;
    }

    const response = await fetch(targetUrl, {
      method,
      headers,
      body: method !== 'GET' && method !== 'HEAD' ? request.clone().body : undefined,
    });

    // 提取並轉發 session cookie
    const setCookie = response.headers.get('set-cookie');
    const responseHeaders: Record<string, string> = {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-gps-jsession, Cookie, Origin, Accept, Accept-Language',
      'Access-Control-Expose-Headers': 'Set-Cookie, JSESSIONID',
    };

    if (setCookie) {
      responseHeaders['Set-Cookie'] = setCookie;
    }

    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[GPS Proxy] Fetch error:', error);
    return new Response(JSON.stringify({
      error: 'Proxy request failed',
      message: String(error),
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
