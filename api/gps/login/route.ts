/**
 * Vercel GPS Proxy - Login Route
 * 
 * 處理 /api/gps/login 請求（由 gpsProxy.js 映射到 StandardApiAction_login.action）
 */

const GPS_SERVER = 'console.onefleet.hk';

export const runtime = 'edge';

export async function POST(request: Request): Promise<Response> {
  console.log('[Vercel GPS Proxy] POST: /api/gps/login');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-gps-jsession',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const formData = await request.formData();
    const account = (formData as any).get('account') as string;
    const password = (formData as any).get('password') as string;

    console.log('[Vercel GPS Proxy] Login attempt for:', account);

    const response = await fetch(`https://${GPS_SERVER}/StandardApiAction_login.action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({ account, password }),
    });

    const data = await response.json();

    // ★ 提取 session 並返回給客戶端（支援 _proxySession 格式）
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/JSESSIONID=([^;]+)/);
      if (match) {
        data._proxySession = match[1];
        console.log('[Vercel GPS Proxy] Got session:', match[1].substring(0, 16) + '...');
      }
    }

    console.log('[Vercel GPS Proxy] Login result:', data.result);

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('[Vercel GPS Proxy] Login error:', error);
    return Response.json({ result: -1, error: String(error) }, { status: 500 });
  }
}

// 也支持 GET 用於調試
export async function GET(request: Request): Promise<Response> {
  return new Response(JSON.stringify({ message: 'GPS Proxy Login endpoint. Use POST.' }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
