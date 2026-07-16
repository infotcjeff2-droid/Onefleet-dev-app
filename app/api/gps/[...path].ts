/**
 * GPS Proxy API Route for Expo
 * 
 * 解決 CORS 問題，轉發請求到 console.onefleet.hk
 */

const GPS_SERVER = 'console.onefleet.hk';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fullPath = url.pathname.replace('/api/gps', '') || '/';
  const searchParams = url.searchParams.toString();
  const apiPath = searchParams ? `${fullPath}?${searchParams}` : fullPath;

  return proxyRequest('GET', apiPath, undefined, request);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const apiPath = url.pathname.replace('/api/gps', '') || '/';
  const body = await request.text();

  return proxyRequest('POST', apiPath, body, request);
}

async function proxyRequest(
  method: string,
  apiPath: string,
  body: string | undefined,
  request: Request
): Promise<Response> {
  const clientJsession = request.headers.get('x-gps-jsession');
  const headers: Record<string, string> = {
    'Host': GPS_SERVER,
    'User-Agent': 'FleetPro/1.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    'Content-Type': request.headers.get('content-type') || 'application/x-www-form-urlencoded',
  };

  if (clientJsession) {
    headers['Cookie'] = `JSESSIONID=${clientJsession}`;
  }

  try {
    const response = await fetch(`https://${GPS_SERVER}${apiPath}`, {
      method,
      headers,
      body: method === 'POST' ? body : undefined,
    });

    const data = await response.text();
    const responseHeaders = new Headers();
    
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, x-gps-jsession');
    responseHeaders.set('Access-Control-Expose-Headers', 'Set-Cookie');
    
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      responseHeaders.set('Set-Cookie', setCookie);
    }

    return new Response(data, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error), result: -1 }),
      { 
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-gps-jsession',
    },
  });
}
