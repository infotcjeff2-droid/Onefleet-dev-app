/**
 * Vercel GPS Proxy - Catch-all Route
 * 
 * 處理所有未匹配的 /api/gps/* 請求，轉發到 808GPS 服務器
 */

const GPS_SERVER = 'console.onefleet.hk';

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

  // 移除 /api/gps 前綴
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

    // 提取並緩存 session
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

  // 移除 /api/gps 前綴
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

    // 提取並緩存 session
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
