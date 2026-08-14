/**
 * Vercel GPS Proxy - Catch-all Route
 */

export const runtime = 'edge';

const GPS_SERVER = 'console.onefleet.hk';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const searchParams = url.searchParams;

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
                     searchParams.get('jsessionId') || '';

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (jsessionId) {
      headers['Cookie'] = `JSESSIONID=${jsessionId}`;
    }

    const gpsUrl = `https://${GPS_SERVER}${fullPath}`;
    const response = await fetch(gpsUrl, { headers });
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    return Response.json({ result: -1, error: String(error) }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const searchParams = url.searchParams;

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
                     searchParams.get('jsessionId') || '';

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

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    return Response.json({ result: -1, error: String(error) }, { status: 502 });
  }
}
