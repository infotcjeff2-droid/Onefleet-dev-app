/**
 * Vercel GPS Proxy - Catch-all Route
 * 
 * 處理所有未匹配的 /api/gps/* 請求，轉發到 808GPS 服務器
 */

const GPS_SERVER = 'console.onefleet.hk';
const GPS_VIDEO_PORT = 6604;

// Session 緩存
let sessionCache: string | null = null;

// 視頻流處理 - 使用標準 runtime（非 edge）
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const searchParams = url.searchParams;

  console.log(`[Vercel GPS Proxy] GET: ${pathname}`);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-gps-jsession',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // 移除 /api/gps 前綴
  const apiPath = pathname.replace(/^\/api\/gps/, '');
  const queryString = searchParams.toString();
  const fullPath = queryString ? `${apiPath}?${queryString}` : apiPath;

  // ============ FLV 流處理 ============
  if (apiPath.includes('/flv-stream')) {
    return handleFlvStream(request, url, searchParams);
  }

  // ============ HLS 流處理 ============
  if (apiPath.includes('/hls-stream')) {
    return handleHlsStream(request, url, searchParams);
  }

  // ============ JSON API 處理 ============
  return handleJsonApi(request, fullPath, corsHeaders);
}

// ============ FLV 串流處理 ============
async function handleFlvStream(request: Request, url: URL, searchParams: URLSearchParams): Promise<Response> {
  const devIdno = searchParams.get('devIdno') || '';
  const channel = searchParams.get('channel') || '0';
  const stream = searchParams.get('stream') || '0';
  const jsessionId = searchParams.get('jsessionId') || '';

  if (!devIdno) {
    return new Response('Missing devIdno', { status: 400 });
  }

  const flvUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/3/3?AVType=1&jsession=${encodeURIComponent(jsessionId)}&DevIDNO=${encodeURIComponent(devIdno)}&Channel=${channel}&Stream=${stream}`;

  console.log('[Vercel Proxy] FLV URL:', flvUrl);

  try {
    const response = await fetch(flvUrl, {
      headers: {
        'Accept': 'video/x-flv, */*',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Upstream error', status: response.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 檢查是否為 FLV
    const initialBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(initialBuffer);
    const isFlv = uint8Array[0] === 0x46 && uint8Array[1] === 0x4C && uint8Array[2] === 0x56;

    if (!isFlv && initialBuffer.byteLength < 500) {
      const text = new TextDecoder().decode(initialBuffer);
      return new Response(JSON.stringify({ error: 'Not FLV', preview: text.substring(0, 200) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 流式傳輸
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(initialBuffer);
        if (response.body) {
          response.body.getReader().then(reader => {
            const pump = () => reader.read().then(({ done, value }) => {
              if (done) { controller.close(); return; }
              controller.enqueue(value);
              pump();
            });
            pump();
          }).catch(e => controller.error(e));
        } else {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'video/x-flv',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[Vercel Proxy] FLV error:', error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 502 });
  }
}

// ============ HLS m3u8 處理 ============
async function handleHlsStream(request: Request, url: URL, searchParams: URLSearchParams): Promise<Response> {
  const devIdno = searchParams.get('devIdno') || '';
  const channel = searchParams.get('channel') || '0';
  const stream = searchParams.get('stream') || '0';
  const jsessionId = searchParams.get('jsessionId') || '';

  if (!devIdno) {
    return new Response('Missing devIdno', { status: 400 });
  }

  const m3u8Filename = `1_${devIdno}_${channel}_${stream}.m3u8`;
  const hlsUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/hls/${m3u8Filename}?jsession=${encodeURIComponent(jsessionId)}`;

  console.log('[Vercel Proxy] HLS URL:', hlsUrl);

  try {
    const response = await fetch(hlsUrl, {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const content = await response.text();

    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[Vercel Proxy] HLS error:', error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 502 });
  }
}

// ============ JSON API 處理 ============
async function handleJsonApi(request: Request, fullPath: string, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const jsessionId = request.headers.get('x-gps-jsession') ||
                     searchParams.get('jsessionId') ||
                     sessionCache || '';

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (jsessionId) {
      headers['Cookie'] = `JSESSIONID=${jsessionId}`;
    }

    const gpsUrl = `https://${GPS_SERVER}${fullPath}`;
    console.log(`[Vercel GPS Proxy] Forwarding to: ${gpsUrl}`);

    const response = await fetch(gpsUrl, { headers });

    // 提取並緩存 session
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/JSESSIONID=([^;]+)/);
      if (match) {
        sessionCache = match[1];
      }
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('[Vercel GPS Proxy] GET error:', error);
    return Response.json({ result: -1, error: String(error) }, { status: 502 });
  }
}

// POST 處理
export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const searchParams = url.searchParams;

  console.log(`[Vercel GPS Proxy] POST: ${pathname}`);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-gps-jsession',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const apiPath = pathname.replace(/^\/api\/gps/, '');
  const queryString = searchParams.toString();
  const fullPath = queryString ? `${apiPath}?${queryString}` : apiPath;

  const jsessionId = request.headers.get('x-gps-jsession') ||
                     searchParams.get('jsessionId') ||
                     sessionCache || '';

  try {
    const body = await request.text();

    const headers: Record<string, string> = {
      'Content-Type': request.headers.get('content-type') || 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    };

    if (jsessionId) {
      headers['Cookie'] = `JSESSIONID=${jsessionId}`;
    }

    const gpsUrl = `https://${GPS_SERVER}${fullPath}`;
    const response = await fetch(gpsUrl, {
      method: 'POST',
      headers,
      body,
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/JSESSIONID=([^;]+)/);
      if (match) {
        sessionCache = match[1];
      }
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('[Vercel GPS Proxy] POST error:', error);
    return Response.json({ result: -1, error: String(error) }, { status: 502 });
  }
}
