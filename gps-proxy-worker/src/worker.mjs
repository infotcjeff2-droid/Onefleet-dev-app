/**
 * Cloudflare Worker - GPS Proxy
 */

const GPS_SERVER = 'console.onefleet.hk';
const GPS_VIDEO_PORT = '6604';
const ADMIN_ACCOUNT = 'admin';
const ADMIN_PASSWORD_MD5 = '4FF4C011268967DF32B6253CA0E7BDF0';

let cachedAdminSession = null;
let cachedAdminSessionTime = 0;
const ADMIN_SESSION_CACHE_TTL = 5 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-gps-jsession, Cookie, Origin, Accept, Accept-Language',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers': 'Set-Cookie, JSESSIONID',
};

async function loginAdminSession() {
  const loginUrl = `https://${GPS_SERVER}/StandardApiAction_login.action`;
  const body = `account=${ADMIN_ACCOUNT}&password=${ADMIN_PASSWORD_MD5}`;

  try {
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      if (json.result === 0 && json.jsession) return json.jsession;
    } catch (e) {}
    return null;
  } catch (error) {
    return null;
  }
}

async function getValidAdminSession() {
  const now = Date.now();
  if (cachedAdminSession && (now - cachedAdminSessionTime) < ADMIN_SESSION_CACHE_TTL) {
    return cachedAdminSession;
  }
  const newSession = await loginAdminSession();
  if (newSession) {
    cachedAdminSession = newSession;
    cachedAdminSessionTime = now;
  }
  return newSession;
}

async function handleFlvStream(url) {
  const devIdno = url.searchParams.get('devIdno') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '0';

  if (!devIdno) {
    return new Response('Missing devIdno parameter', { status: 400 });
  }

  const jsession = await getValidAdminSession();
  if (!jsession) {
    return new Response(JSON.stringify({ error: '無法獲取 session' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const flvUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/3/3?AVType=1&jsession=${encodeURIComponent(jsession)}&DevIDNO=${encodeURIComponent(devIdno)}&Channel=${channel}&Stream=${stream}`;

  try {
    const response = await fetch(flvUrl, {
      headers: {
        'Accept': 'video/x-flv, application/octet-stream, */*',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    const isFlv = uint8Array[0] === 0x46 && uint8Array[1] === 0x4C && uint8Array[2] === 0x56;

    if (!isFlv && buffer.byteLength < 1000) {
      const textDecoder = new TextDecoder();
      const text = textDecoder.decode(buffer);
      return new Response(JSON.stringify({ error: 'Not FLV', preview: text.substring(0, 300) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/x-flv',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch FLV' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleHlsStream(url) {
  const devIdno = url.searchParams.get('devIdno') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '0';

  if (!devIdno) {
    return new Response('Missing devIdno parameter', { status: 400 });
  }

  const jsession = await getValidAdminSession();
  if (!jsession) {
    return new Response(JSON.stringify({ error: '無法獲取 session' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const hlsUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/hls/1_${devIdno}_${channel}_${stream}.m3u8?jsession=${encodeURIComponent(jsession)}`;

  try {
    const response = await fetch(hlsUrl);
    const text = await response.text();

    if (!text.includes('#EXTM3U')) {
      return new Response(JSON.stringify({ error: 'Not HLS' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch HLS' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleJsonApi(request, url) {
  const pathname = url.pathname;
  let targetPath = pathname;

  if (pathname.startsWith('/api/gps/')) {
    targetPath = pathname.slice('/api/gps'.length) || '/';
  } else if (pathname === '/api/gps' || pathname === '/api/gps/') {
    targetPath = '/';
  }

  const targetUrl = `http://${GPS_SERVER}${targetPath}${url.search}`;
  const method = request.method;

  let sessionId = '';
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieMatch = cookieHeader.match(/JSESSIONID=([^;]+)/);
  if (cookieMatch) sessionId = cookieMatch[1];
  else sessionId = request.headers.get('x-gps-jsession') || '';

  try {
    const headers = {
      'Content-Type': request.headers.get('Content-Type') || 'application/json',
      'Accept': 'application/json, */*',
      'User-Agent': 'Mozilla/5.0',
    };

    if (sessionId) headers['Cookie'] = `JSESSIONID=${sessionId}`;

    const response = await fetch(targetUrl, { method, headers });
    const text = await response.text();
    const setCookie = response.headers.get('set-cookie');

    const responseHeaders = {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-gps-jsession, Cookie, Origin, Accept, Accept-Language',
      'Access-Control-Expose-Headers': 'Set-Cookie, JSESSIONID',
    };

    if (setCookie) responseHeaders['Set-Cookie'] = setCookie;

    return new Response(text, { status: response.status, headers: responseHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Proxy request failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

const worker = {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (pathname.includes('/flv-stream')) return handleFlvStream(url);
    if (pathname.includes('/hls-stream')) return handleHlsStream(url);

    return handleJsonApi(request, url);
  }
};

export default worker;
