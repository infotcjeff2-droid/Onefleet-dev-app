/**
 * Vercel Edge Function - HLS 串流代理
 * 
 * 使用 Edge Runtime 支援 HLS m3u8 播放列表和 TS 分段
 * 轉發 HLS 視訊串流到前端，解決 CORS 問題
 */

export const runtime = 'edge';

const GPS_SERVER = 'console.onefleet.hk';
const GPS_VIDEO_PORT = '6604';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const devIdno = url.searchParams.get('devIdno') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '1';
  const jsessionId = url.searchParams.get('jsessionId') || '';

  // 處理 TS 分段請求
  if (pathname.includes('/hls-segment')) {
    return handleHlsSegment(url);
  }

  // 處理 HLS m3u8 播放列表請求
  console.log(`[HLS Edge] Request: devIdno=${devIdno}, channel=${channel}, stream=${stream}`);

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

  const m3u8Filename = `1_${devIdno}_${channel}_${stream}.m3u8`;
  const hlsUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/hls/${m3u8Filename}?jsession=${encodeURIComponent(jsessionId)}`;

  console.log(`[HLS Edge] Fetching: ${hlsUrl}`);

  try {
    const response = await fetch(hlsUrl, {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    console.log(`[HLS Edge] Upstream status: ${response.status}`);

    if (!response.ok) {
      const text = await response.text();
      console.error(`[HLS Edge] Upstream error: ${text.substring(0, 200)}`);
      return new Response(JSON.stringify({ 
        error: 'HLS stream error',
        status: response.status,
        details: text.substring(0, 500)
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const text = await response.text();

    // 檢查是否為有效的 m3u8 播放列表
    if (!text.includes('#EXTM3U')) {
      console.error('[HLS Edge] Not a valid m3u8 playlist');
      return new Response(JSON.stringify({ 
        error: 'Invalid m3u8 playlist',
        response: text.substring(0, 500)
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 重寫 TS 分段 URL
    const proxyBase = getProxyBase(request);
    const lines = text.split(/\r?\n/);
    const rewritten = lines.map((line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }
      // TS 分段 URL 重寫
      if (trimmed.endsWith('.ts') || trimmed.includes('.ts?') || /^\d+\.ts/.test(trimmed)) {
        return `${proxyBase}/api/gps/hls-stream/hls-segment?url=${encodeURIComponent(trimmed)}&jsessionId=${encodeURIComponent(jsessionId)}`;
      }
      return line;
    }).join('\n');

    console.log(`[HLS Edge] Playlist rewritten, segments: ${lines.filter(l => l.includes('.ts')).length}`);

    return new Response(rewritten, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('[HLS Edge] Error:', error);
    return new Response(JSON.stringify({ 
      error: `HLS stream error: ${String(error)}` 
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// 處理 HLS TS 分段
async function handleHlsSegment(url: URL): Promise<Response> {
  const segmentUrl = url.searchParams.get('url') || '';

  if (!segmentUrl) {
    return new Response(JSON.stringify({ error: 'Missing segment url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`[HLS Edge] Segment: ${segmentUrl.substring(0, 100)}...`);

  try {
    // 構建完整的分段 URL
    let fullUrl = segmentUrl;
    if (!segmentUrl.startsWith('http')) {
      fullUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/hls/${segmentUrl}`;
    }

    const response = await fetch(fullUrl, {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      console.error(`[HLS Edge] Segment error: ${response.status}`);
      return new Response(null, { status: response.status });
    }

    const buffer = await response.arrayBuffer();

    return new Response(buffer, {
      headers: {
        'Content-Type': 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=10',
      },
    });

  } catch (error) {
    console.error('[HLS Edge] Segment fetch error:', error);
    return new Response(JSON.stringify({ 
      error: `Segment error: ${String(error)}` 
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function getProxyBase(request: Request): string {
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  return `${forwardedProto}://${forwardedHost}`;
}
