/**
 * Vercel GPS Proxy - Catch-all Route
 * 
 * 處理所有 /api/gps/* 請求，轉發到 808GPS 服務器
 * 包括 JSON API 和影像串流 (FLV/HLS)
 */

const GPS_SERVER = 'console.onefleet.hk';
const GPS_VIDEO_PORT = '6604';

// Session 緩存（邊緣級別）
let sessionCache: string | null = null;

export const runtime = 'edge';

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

  // ============ FLV 串流處理 ============
  if (pathname.includes('/flv-stream')) {
    return handleFlvStream(url);
  }

  // ============ HLS m3u8 處理 ============
  if (pathname.includes('/hls-stream')) {
    return handleHlsStream(url);
  }

  // ============ HLS TS 分段處理 ============
  if (pathname.includes('/hls-segment')) {
    return handleHlsSegment(url);
  }

  // ============ JSON API 處理 ============
  const apiPath = pathname.replace(/^\/api\/gps/, '');
  const queryString = searchParams.toString();
  const fullPath = queryString ? `${apiPath}?${queryString}` : apiPath;

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

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/JSESSIONID=([^;]+)/);
      if (match) {
        sessionCache = match[1];
        console.log('[Vercel GPS Proxy] Session cached:', match[1].substring(0, 16) + '...');
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

  // JSON API 處理
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
    console.log(`[Vercel GPS Proxy] Forwarding POST to: ${gpsUrl}`);

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
        console.log('[Vercel GPS Proxy] Session cached:', match[1].substring(0, 16) + '...');
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

// ============ FLV 串流處理函式 ============
async function handleFlvStream(url: URL): Promise<Response> {
  const devIdno = url.searchParams.get('devIdno') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '0';
  const jsessionId = url.searchParams.get('jsessionId') || '';

  if (!devIdno) {
    return new Response('Missing devIdno parameter', { status: 400 });
  }

  const flvUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/3/3?AVType=1&jsession=${encodeURIComponent(jsessionId)}&DevIDNO=${encodeURIComponent(devIdno)}&Channel=${channel}&Stream=${stream}`;

  console.log('[Vercel FLV] Fetching:', flvUrl.substring(0, 150) + '...');

  try {
    const response = await fetch(flvUrl, {
      headers: {
        'Accept': 'video/x-flv, application/octet-stream, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[Vercel FLV] Upstream error:', response.status, text.substring(0, 200));
      return new Response(JSON.stringify({
        error: 'Video server returned error',
        status: response.status,
        message: text.substring(0, 500),
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!response.body) {
      return new Response('No response body', { status: 502 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            controller.enqueue(value);
          }
        } catch (error) {
          console.error('[Vercel FLV] Stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'video/x-flv',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[Vercel FLV] Error:', error);
    return new Response('FLV stream error: ' + String(error), { status: 502 });
  }
}

// ============ HLS m3u8 處理函式 ============
async function handleHlsStream(url: URL): Promise<Response> {
  const devIdno = url.searchParams.get('devIdno') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '0';
  const jsessionId = url.searchParams.get('jsessionId') || '';

  if (!devIdno) {
    return new Response('Missing devIdno parameter', { status: 400 });
  }

  const m3u8Filename = `1_${devIdno}_${channel}_${stream}.m3u8`;
  const hlsUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/hls/${m3u8Filename}?jsession=${encodeURIComponent(jsessionId)}`;

  console.log('[Vercel HLS] Fetching:', hlsUrl.substring(0, 150) + '...');

  try {
    const response = await fetch(hlsUrl, {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[Vercel HLS] Upstream error:', response.status, text.substring(0, 200));
      return new Response(`HLS upstream error: ${response.status}`, { status: 502 });
    }

    const text = await response.text();
    const proxyBase = `${url.protocol}//${url.host}`;
    const segSession = jsessionId ? `&jsessionId=${encodeURIComponent(jsessionId)}` : '';

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
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[Vercel HLS] Error:', error);
    return new Response('HLS stream error: ' + String(error), { status: 502 });
  }
}

// ============ HLS TS 分段處理函式 ============
async function handleHlsSegment(url: URL): Promise<Response> {
  const segmentUrl = url.searchParams.get('url') || '';

  if (!segmentUrl) {
    return new Response('Missing segment url parameter', { status: 400 });
  }

  console.log('[Vercel HLS Segment] Fetching:', segmentUrl.substring(0, 200) + '...');

  try {
    const response = await fetch(segmentUrl, {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error('[Vercel HLS Segment] Upstream error:', response.status);
      return new Response('Segment upstream error', { status: 502 });
    }

    if (!response.body) {
      return new Response('No response body', { status: 502 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            controller.enqueue(value);
          }
        } catch (error) {
          console.error('[Vercel HLS Segment] Stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=10',
      },
    });
  } catch (error) {
    console.error('[Vercel HLS Segment] Error:', error);
    return new Response('Segment error: ' + String(error), { status: 502 });
  }
}
