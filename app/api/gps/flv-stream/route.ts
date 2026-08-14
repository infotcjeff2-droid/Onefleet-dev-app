/**
 * Vercel Edge Function - FLV 串流代理
 * 
 * 使用 Edge Runtime 支援長時間串流連線
 * 轉發 HTTP-FLV 視訊串流到前端，解決 CORS 問題
 */

export const runtime = 'edge';

const GPS_SERVER = 'console.onefleet.hk';
const GPS_VIDEO_PORT = '6604';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const devIdno = url.searchParams.get('devIdno') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '1';
  const jsessionId = url.searchParams.get('jsessionId') || '';

  console.log(`[FLV Edge] Request: devIdno=${devIdno}, channel=${channel}, stream=${stream}`);

  if (!devIdno) {
    return new Response(JSON.stringify({ error: 'Missing devIdno parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!jsessionId) {
    return new Response(JSON.stringify({ error: 'Missing jsessionId parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const flvUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/3/3?AVType=1&jsession=${encodeURIComponent(jsessionId)}&DevIDNO=${encodeURIComponent(devIdno)}&Channel=${channel}&Stream=${stream}`;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    console.log(`[FLV Edge] Fetching: ${flvUrl.substring(0, 150)}...`);

    const response = await fetch(flvUrl, {
      headers: {
        'Accept': 'video/x-flv, application/octet-stream, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    console.log(`[FLV Edge] Upstream status: ${response.status}`);

    if (!response.ok && response.status !== 200) {
      const text = await response.text();
      console.error(`[FLV Edge] Upstream error: ${text.substring(0, 200)}`);
      return new Response(JSON.stringify({ 
        error: 'FLV stream error', 
        status: response.status,
        details: text.substring(0, 500)
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 檢查是否是有效的 FLV
    const contentType = response.headers.get('content-type') || '';
    const reader = response.body?.getReader();
    
    if (!reader) {
      return new Response(JSON.stringify({ error: 'No response body' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 使用 TransformStream 進行流式轉發
    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              console.log('[FLV Edge] Stream completed');
              break;
            }
            controller.enqueue(value);
          }
        } catch (error) {
          console.error('[FLV Edge] Stream error:', error);
          controller.error(error);
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'video/x-flv',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
      },
    });

  } catch (error) {
    console.error('[FLV Edge] Error:', error);
    return new Response(JSON.stringify({ 
      error: `FLV stream error: ${String(error)}` 
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
