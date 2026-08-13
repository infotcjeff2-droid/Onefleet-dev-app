/**
 * Vercel GPS Proxy API Route
 * 
 * 處理所有 /api/gps/* 請求，轉發到 808GPS 服務器
 * 
 * 重要：Vercel Serverless Functions 特性：
 * - 無狀態（每次請求可能分配不同的實例）
 * - 最大執行時間 10 秒（function）~ 60 秒（edge）
 * - 無法維持長連接（FLV stream 需要特殊處理）
 * 
 * 解決方案：
 * - Session 通過 JSESSION cookie 頭傳遞，不依賴服務器端緩存
 * - FLV/HLS stream 通過代理轉發
 */

// 邊緣函數級別的 session 緩存（不可靠，僅作為優化）
const GPS_SERVER = 'console.onefleet.hk';
const ADMIN_ACCOUNT = process.env.GPS_ADMIN_ACCOUNT || 'admin';
const ADMIN_PASSWORD_MD5 = process.env.GPS_ADMIN_PASSWORD_MD5 || '4FF4C011268967DF32B6253CA0E7BDF0';

// 簡單的 session 緩存（可能不持久化，僅作為優化）
let sessionCache: { jsessionCookie: string; lastLogin: string; isAdminSession: boolean } | null = null;

// Edge Runtime 兼容的導出
export const runtime = 'edge';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const searchParams = url.searchParams;
  
  // 調試日誌
  console.log('[Vercel GPS Proxy] GET:', pathname, Object.fromEntries(searchParams));
  
  // 處理 /api/gps/video-url 請求
  if (pathname.endsWith('/api/gps/video-url')) {
    return handleVideoUrl(request, searchParams);
  }
  
  // 處理 /api/gps/flv-stream 請求
  if (pathname.endsWith('/api/gps/flv-stream')) {
    return handleFlvStream(request, searchParams);
  }
  
  // 處理 /api/gps/hls-stream 請求
  if (pathname.endsWith('/api/gps/hls-stream')) {
    return handleHlsStream(request, searchParams);
  }
  
  // 處理 /api/gps/hls-segment 請求
  if (pathname.endsWith('/api/gps/hls-segment')) {
    return handleHlsSegment(request, searchParams);
  }
  
  // 其他 GPS API 請求（使用 catch-all 路由）
  return handleGpsApi(request, searchParams, pathname);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const searchParams = url.searchParams;
  
  // 調試日誌
  console.log('[Vercel GPS Proxy] POST:', pathname);
  
  // 處理登入請求
  if (pathname.includes('/login.action')) {
    return handleLogin(request);
  }
  
  // 其他 POST 請求
  return handleGpsApiPost(request, searchParams, pathname);
}

async function handleLogin(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const account = formData.get('account') as string;
    const password = formData.get('password') as string;
    
    const response = await fetch(`https://${GPS_SERVER}/StandardApiAction_login.action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ account, password }),
    });
    
    const data = await response.json();
    
    // 提取 session cookie
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/JSESSIONID=([^;]+)/);
      if (match) {
        sessionCache = {
          jsessionCookie: match[1],
          lastLogin: new Date().toISOString(),
          isAdminSession: false,
        };
        data._proxySession = match[1];
      }
    }
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[Vercel GPS Proxy] Login error:', error);
    return Response.json({ result: -1, error: String(error) }, { status: 500 });
  }
}

async function handleVideoUrl(request: Request, searchParams: URLSearchParams): Promise<Response> {
  const devIdno = searchParams.get('devIdno') || '';
  const channel = searchParams.get('channel') || '0';
  const stream = searchParams.get('stream') || '0';
  const jsessionId = searchParams.get('jsessionId') || sessionCache?.jsessionCookie || '';
  
  const proxyBase = getProxyBase(request);
  
  return Response.json({
    result: 0,
    videoUrl: `${proxyBase}/api/gps/hls-stream?devIdno=${encodeURIComponent(devIdno)}&channel=${channel}&stream=${stream}&jsessionId=${jsessionId}`,
    flvUrl: `${proxyBase}/api/gps/flv-stream?devIdno=${encodeURIComponent(devIdno)}&channel=${channel}&stream=${stream}&jsessionId=${jsessionId}`,
    hlsUrl: `${proxyBase}/api/gps/hls-stream?devIdno=${encodeURIComponent(devIdno)}&channel=${channel}&stream=${stream}&jsessionId=${jsessionId}`,
    devIdno,
    channel: parseInt(channel, 10),
    stream: parseInt(stream, 10),
  }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

async function handleFlvStream(request: Request, searchParams: URLSearchParams): Promise<Response> {
  const devIdno = searchParams.get('devIdno') || '';
  const channel = searchParams.get('channel') || '0';
  const stream = searchParams.get('stream') || '0';
  const jsessionId = searchParams.get('jsessionId') || sessionCache?.jsessionCookie || '';
  
  // 構建 FLV URL
  const flvUrl = `http://${GPS_SERVER}:6604/3/3?AVType=1&jsession=${encodeURIComponent(jsessionId)}&DevIDNO=${encodeURIComponent(devIdno)}&Channel=${channel}&Stream=${stream}`;
  
  try {
    const response = await fetch(flvUrl, {
      headers: {
        'Accept': 'video/x-flv, application/octet-stream, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': 'video/x-flv',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[Vercel GPS Proxy] FLV error:', error);
    return Response.json({ result: -1, error: String(error) }, { status: 502 });
  }
}

async function handleHlsStream(request: Request, searchParams: URLSearchParams): Promise<Response> {
  const devIdno = searchParams.get('devIdno') || '';
  const channel = searchParams.get('channel') || '0';
  const stream = searchParams.get('stream') || '0';
  const jsessionId = searchParams.get('jsessionId') || sessionCache?.jsessionCookie || '';
  
  // 808GPS HLS URL
  const m3u8Filename = `1_${devIdno}_${channel}_${stream}.m3u8`;
  const hlsUrl = `http://${GPS_SERVER}:6604/hls/${m3u8Filename}?jsession=${encodeURIComponent(jsessionId)}`;
  
  try {
    const response = await fetch(hlsUrl, {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    
    if (!response.ok) {
      const text = await response.text();
      return Response.json({
        result: -1,
        error: `HLS upstream error: ${response.status}`,
        upstreamResponse: text.substring(0, 500),
      }, { status: 502 });
    }
    
    const text = await response.text();
    const proxyBase = getProxyBase(request);
    const segSession = jsessionId ? `&jsessionId=${encodeURIComponent(jsessionId)}` : '';
    
    // 重寫 TS 分段 URL
    const rewritten = text.split(/\r?\n/).map((line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }
      if (trimmed.endsWith('.ts') || trimmed.includes('.ts?') || /^\d+\.ts/.test(trimmed)) {
        return `${proxyBase}/api/gps/hls-segment?url=${encodeURIComponent(trimmed)}${segSession}`;
      }
      return line;
    }).join('\n');
    
    return new Response(rewritten, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[Vercel GPS Proxy] HLS error:', error);
    return Response.json({ result: -1, error: String(error) }, { status: 502 });
  }
}

async function handleHlsSegment(request: Request, searchParams: URLSearchParams): Promise<Response> {
  const segmentUrl = searchParams.get('url') || '';
  
  if (!segmentUrl) {
    return Response.json({ result: -1, error: 'Missing segment url' }, { status: 400 });
  }
  
  try {
    const response = await fetch(segmentUrl, {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=10',
      },
    });
  } catch (error) {
    console.error('[Vercel GPS Proxy] Segment error:', error);
    return Response.json({ result: -1, error: String(error) }, { status: 502 });
  }
}

async function handleGpsApi(request: Request, searchParams: URLSearchParams, pathname: string): Promise<Response> {
  // 移除 /api/gps 前綴
  const apiPath = pathname.replace(/^\/api\/gps/, '');
  const queryString = searchParams.toString();
  const fullPath = queryString ? `${apiPath}?${queryString}` : apiPath;
  
  const jsessionId = request.headers.get('x-gps-jsession') || 
                     searchParams.get('jsessionId') || 
                     sessionCache?.jsessionCookie || '';
  
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Origin': getProxyBase(request),
    };
    
    if (jsessionId) {
      headers['Cookie'] = `JSESSIONID=${jsessionId}`;
    }
    
    const url = `https://${GPS_SERVER}${fullPath}`;
    const response = await fetch(url, { headers });
    
    const data = await response.json();
    
    // 提取並緩存 session
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/JSESSIONID=([^;]+)/);
      if (match) {
        sessionCache = {
          jsessionCookie: match[1],
          lastLogin: new Date().toISOString(),
          isAdminSession: false,
        };
      }
    }
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[Vercel GPS Proxy] API error:', error);
    return Response.json({ result: -1, error: String(error) }, { status: 502 });
  }
}

async function handleGpsApiPost(request: Request, searchParams: URLSearchParams, pathname: string): Promise<Response> {
  const apiPath = pathname.replace(/^\/api\/gps/, '');
  const queryString = searchParams.toString();
  const fullPath = queryString ? `${apiPath}?${queryString}` : apiPath;
  
  const jsessionId = request.headers.get('x-gps-jsession') || 
                     searchParams.get('jsessionId') || 
                     sessionCache?.jsessionCookie || '';
  
  try {
    const body = await request.text();
    
    const headers: Record<string, string> = {
      'Content-Type': request.headers.get('content-type') || 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Origin': getProxyBase(request),
    };
    
    if (jsessionId) {
      headers['Cookie'] = `JSESSIONID=${jsessionId}`;
    }
    
    const url = `https://${GPS_SERVER}${fullPath}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });
    
    const data = await response.json();
    
    // 提取並緩存 session
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/JSESSIONID=([^;]+)/);
      if (match) {
        sessionCache = {
          jsessionCookie: match[1],
          lastLogin: new Date().toISOString(),
          isAdminSession: false,
        };
      }
    }
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[Vercel GPS Proxy] POST API error:', error);
    return Response.json({ result: -1, error: String(error) }, { status: 502 });
  }
}

function getProxyBase(request: Request): string {
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  return `${forwardedProto}://${forwardedHost}`;
}
