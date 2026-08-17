/**
 * Cloudflare Worker - GPS Proxy
 *
 * 處理所有 GPS API 請求，轉發到 console.onefleet.hk
 * 支援 CORS 和視頻串流
 * 自動使用 admin session 處理視頻流（用戶 session 沒有視頻權限）
 */

interface Env {
  GPS_SERVER?: string;
  GPS_VIDEO_PORT?: string;
  GPS_ADMIN_ACCOUNT?: string;
  GPS_ADMIN_PASSWORD_MD5?: string;
}

const DEFAULT_GPS_SERVER = 'console.onefleet.hk';
const DEFAULT_GPS_VIDEO_PORT = '6604';
const DEFAULT_GPS_ADMIN_ACCOUNT = 'admin';
const DEFAULT_GPS_ADMIN_PASSWORD_MD5 = '4FF4C011268967DF32B6253CA0E7BDF0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-gps-jsession, Cookie, Origin, Accept, Accept-Language, Range',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers': 'Set-Cookie, JSESSIONID, Content-Length, Content-Range',
};

// ============ Admin session 管理 ============
let adminSessionCache: { jsession: string; expires: number } | null = null;
let adminSessionPromise: Promise<string> | null = null;

async function getAdminSession(env: Env): Promise<string> {
  // 如果有緩存且未過期，直接返回
  if (adminSessionCache && adminSessionCache.expires > Date.now()) {
    return adminSessionCache.jsession;
  }

  // 如果有正在進行的登入請求，等待它
  if (adminSessionPromise) {
    return adminSessionPromise;
  }

  const gpsServer = env.GPS_SERVER || DEFAULT_GPS_SERVER;
  const account = env.GPS_ADMIN_ACCOUNT || DEFAULT_GPS_ADMIN_ACCOUNT;
  const password = env.GPS_ADMIN_PASSWORD_MD5 || DEFAULT_GPS_ADMIN_PASSWORD_MD5;

  // 開始新的登入
  adminSessionPromise = (async () => {
    try {
      const loginUrl = `https://${gpsServer}/StandardApiAction_login.action`;
      const body = new URLSearchParams({
        account,
        password,
      }).toString();

      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body,
      });

      const text = await response.text();
      console.log('[GPS Proxy] Admin login response (first 300):', text.substring(0, 300));

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Admin login non-JSON response: ' + text.substring(0, 200));
      }

      if (data.result !== 0 || !data.jsession) {
        throw new Error('Admin login failed: ' + text.substring(0, 200));
      }

      const jsession = data.jsession;
      // 緩存 25 分鐘（GPS session 預設 30 分鐘過期）
      adminSessionCache = { jsession, expires: Date.now() + 25 * 60 * 1000 };
      console.log('[GPS Proxy] Admin session cached:', jsession);
      return jsession;
    } catch (err) {
      console.error('[GPS Proxy] Admin login error:', err);
      throw err;
    } finally {
      adminSessionPromise = null;
    }
  })();

  return adminSessionPromise;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    console.log(`[GPS Proxy] ${method}: ${pathname}`);

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ============ 處理 FLV 串流 ============
    if (pathname.includes('/flv-stream')) {
      return handleFlvStream(request, url, env);
    }

    // ============ 處理 HLS m3u8 ============
    if (pathname.includes('/hls-stream')) {
      return handleHlsStream(request, url, env);
    }

    // ============ 處理 HLS TS 分段 ============
    if (pathname.includes('/hls-segment')) {
      return handleHlsSegment(request, url, env);
    }

    // ============ 處理視頻 URL ============
    if (pathname.includes('/video-url')) {
      return handleVideoUrl(request, url, env);
    }

    // ============ 其他：JSON API ============
    return handleJsonApi(request, url, env);
  },
};

// ============ FLV 串流處理 ============
async function handleFlvStream(request: Request, url: URL, env: Env): Promise<Response> {
  const gpsServer = env.GPS_SERVER || DEFAULT_GPS_SERVER;
  const gpsVideoPort = env.GPS_VIDEO_PORT || DEFAULT_GPS_VIDEO_PORT;

  const devIdno = url.searchParams.get('devIdno') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '0';
  let jsessionId = url.searchParams.get('jsessionId') || '';

  if (!devIdno) {
    return errorResponse('Missing devIdno parameter', 400);
  }

  // 始終使用 admin session（用戶 session 沒有視頻權限）
  try {
    jsessionId = await getAdminSession(env);
    console.log('[GPS Proxy] Using admin session for FLV');
  } catch (err) {
    return errorResponse('Failed to obtain admin session: ' + String(err), 502);
  }

  const flvUrl = `http://${gpsServer}:${gpsVideoPort}/3/3?AVType=1&jsession=${encodeURIComponent(jsessionId)}&DevIDNO=${encodeURIComponent(devIdno)}&Channel=${channel}&Stream=${stream}`;

  console.log('[GPS Proxy] FLV URL:', flvUrl);

  try {
    const response = await fetch(flvUrl, {
      headers: {
        'Accept': 'video/x-flv, application/octet-stream, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.error('[GPS Proxy] FLV upstream error:', response.status);
      return errorResponse('FLV upstream error: ' + response.status, 502);
    }

    // 驗證第一個 chunk 確認是 FLV 格式（防止無權限 session 返回的 JSON 錯誤）
    const reader = response.body?.getReader();
    if (!reader) {
      return errorResponse('No response body', 502);
    }

    const { value: firstChunk, done } = await reader.read();
    if (done || !firstChunk || firstChunk.length < 3) {
      return errorResponse('Empty response from upstream', 502);
    }

    // 檢查 FLV magic bytes "FLV" (0x46 0x4C 0x56)
    const isFlv = firstChunk[0] === 0x46 && firstChunk[1] === 0x4C && firstChunk[2] === 0x56;
    if (!isFlv) {
      const errorText = new TextDecoder().decode(firstChunk);
      console.error('[GPS Proxy] Non-FLV content:', errorText.substring(0, 300));
      reader.cancel();
      // 清除 admin session 緩存以重新登入
      adminSessionCache = null;
      return errorResponse('GPS server returned non-FLV content: ' + errorText.substring(0, 200), 502);
    }

    // 是 FLV - 累積 chunks 並在背景 pipe 寫入，直到 stream 結束或緩衝滿
    // 釋放第一個 chunk 的 reader，改用新的 reader 進行背景 streaming
    reader.releaseLock();

    // 啟動背景讀取任務，把所有後續 chunks 寫入 transform
    const transform = new TransformStream<Uint8Array, Uint8Array>();
    const writer = transform.writable.getWriter();
    // 先把第一個 chunk 寫進去
    writer.write(firstChunk).catch(() => {});

    (async () => {
      try {
        const streamReader = response.body?.getReader();
        if (!streamReader) {
          await writer.close();
          return;
        }
        try {
          while (true) {
            const { value, done } = await streamReader.read();
            if (done) break;
            if (value) {
              await writer.write(value);
            }
          }
        } finally {
          streamReader.releaseLock();
          await writer.close();
        }
      } catch (err) {
        console.error('[GPS Proxy] FLV background pipe error:', err);
        try { await writer.abort(err as Error); } catch {}
      }
    })();

    return new Response(transform.readable, {
      status: 200,
      headers: {
        'Content-Type': 'video/x-flv',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-gps-jsession, Cookie, Origin, Accept, Accept-Language, Range',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('[GPS Proxy] FLV error:', error);
    return errorResponse('FLV stream error: ' + String(error), 502);
  }
}

// ============ HLS m3u8 處理 ============
async function handleHlsStream(request: Request, url: URL, env: Env): Promise<Response> {
  const gpsServer = env.GPS_SERVER || DEFAULT_GPS_SERVER;
  const gpsVideoPort = env.GPS_VIDEO_PORT || DEFAULT_GPS_VIDEO_PORT;

  const devIdno = url.searchParams.get('devIdno') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '0';
  let jsessionId = url.searchParams.get('jsessionId') || '';

  if (!devIdno) {
    return errorResponse('Missing devIdno parameter', 400);
  }

  // 始終使用 admin session
  try {
    jsessionId = await getAdminSession(env);
  } catch (err) {
    return errorResponse('Failed to obtain admin session: ' + String(err), 502);
  }

  const m3u8Filename = `1_${devIdno}_${channel}_${stream}.m3u8`;
  const hlsUrl = `http://${gpsServer}:${gpsVideoPort}/hls/${m3u8Filename}?jsession=${encodeURIComponent(jsessionId)}`;

  console.log('[GPS Proxy] HLS URL:', hlsUrl);

  try {
    const response = await fetch(hlsUrl, {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error('[GPS Proxy] HLS upstream error:', response.status);
      return errorResponse('HLS upstream error: ' + response.status, 502);
    }

    const text = await response.text();
    if (!text.includes('.m3u8') && !text.includes('#EXTM3U')) {
      console.error('[GPS Proxy] HLS non-m3u8 content:', text.substring(0, 300));
      adminSessionCache = null;
      return errorResponse('HLS non-m3u8 content: ' + text.substring(0, 200), 502);
    }

    // 修改 m3u8 內容，把所有 TS URL 重寫為簡化的 proxy URL
    // GPS server 原始 URL 格式: `2026_08_17_10_37_19_361.ts?PATH=D:\GPS_MEDIA_TEMP\hls\018270193745\0_0\...&DevIDNO=...&Channel=0&Stream=0`
    // 但是簡單形式 `2026_08_17_10_37_19_361.ts?jsession=...` 也可訪問！
    // 所以只提取 ts 檔名（遇到 ? 或空白就停止），devIdno/channel/stream 從原始 m3u8 URL 取得
    const rewrittenText = text.replace(
      /^(\S+?\.ts)[?\s].*$/gm,
      (match, tsName) => {
        const baseUrl = url.origin;
        return `${baseUrl}/api/gps/hls-segment?devIdno=${encodeURIComponent(devIdno)}&channel=${encodeURIComponent(channel)}&stream=${encodeURIComponent(stream)}&ts=${encodeURIComponent(tsName.trim())}`;
      }
    );

    return new Response(rewrittenText, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=2',  // 緩存 2 秒（直播內容短時間內可能重複）
      },
    });
  } catch (error) {
    console.error('[GPS Proxy] HLS error:', error);
    return errorResponse('HLS stream error: ' + String(error), 502);
  }
}

// ============ HLS TS 分段處理 ============
// segment 路徑格式: /api/gps/hls-segment?devIdno=XXX&channel=N&stream=N&ts=YYYYMMDD_HHMMSS_fff&s=TOKEN
// jsession 不需要傳進來，使用 Worker 緩存的 admin session
async function handleHlsSegment(request: Request, url: URL, env: Env): Promise<Response> {
  const gpsServer = env.GPS_SERVER || DEFAULT_GPS_SERVER;
  const gpsVideoPort = env.GPS_VIDEO_PORT || DEFAULT_GPS_VIDEO_PORT;

  const tsName = url.searchParams.get('ts') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '0';
  const devIdno = url.searchParams.get('devIdno') || '';

  if (!tsName) {
    return errorResponse('Missing ts parameter', 400);
  }

  // 使用 admin session（Worker 端緩存）
  let jsessionId: string;
  try {
    jsessionId = await getAdminSession(env);
  } catch (err) {
    return errorResponse('Failed to obtain admin session: ' + String(err), 502);
  }

  // 簡化 URL：直接用 ts 檔名 + jsession + 必要的 PATH 參數
  // GPS server 內部檔案路徑格式: /hls/?ts=FILE&PATH=D:\GPS_MEDIA_TEMP\hls\DEV\CH_STREAM\FILE&DevIDNO=...&Channel=...&Stream=...
  // PATH 參數是 GPS server 內部快取路徑，必須帶
  const segmentUrl = `http://${gpsServer}:${gpsVideoPort}/hls/?ts=${encodeURIComponent(tsName)}&PATH=${encodeURIComponent(`D:\\GPS_MEDIA_TEMP\\hls\\${devIdno}\\${channel}_${stream}\\${tsName}`)}&DevIDNO=${encodeURIComponent(devIdno)}&Channel=${encodeURIComponent(channel)}&Stream=${encodeURIComponent(stream)}&jsession=${encodeURIComponent(jsessionId)}`;

  try {
    const response = await fetch(segmentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error('[GPS Proxy] HLS segment error:', response.status, segmentUrl);
      return errorResponse('HLS segment error: ' + response.status, 502);
    }

    // 串流返回，禁止緩存（直播）
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp2t',
        'Content-Length': response.headers.get('Content-Length') || '',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
        'Cache-Control': 'public, max-age=3600',  // TS segment 不可變（檔名含時間戳），可緩存 1 小時
      },
    });
  } catch (error) {
    return errorResponse('HLS segment error: ' + String(error), 502);
  }
}

// ============ 視頻 URL 處理 ============
async function handleVideoUrl(request: Request, url: URL, env: Env): Promise<Response> {
  const devIdno = url.searchParams.get('devIdno') || '';
  const channel = url.searchParams.get('channel') || '0';
  const stream = url.searchParams.get('stream') || '0';

  const baseUrl = url.origin;
  const flvUrl = `${baseUrl}/api/gps/flv-stream?devIdno=${encodeURIComponent(devIdno)}&channel=${channel}&stream=${stream}`;
  const hlsUrl = `${baseUrl}/api/gps/hls-stream?devIdno=${encodeURIComponent(devIdno)}&channel=${channel}&stream=${stream}`;

  return new Response(JSON.stringify({
    result: 0,
    flvUrl,
    hlsUrl,
    devIdno,
    channel: parseInt(channel, 10),
    stream: parseInt(stream, 10),
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ============ JSON API 處理 ============
async function handleJsonApi(request: Request, url: URL, env: Env): Promise<Response> {
  const gpsServer = env.GPS_SERVER || DEFAULT_GPS_SERVER;
  try {
    // 去掉 /api/gps/ 前綴（前端路徑與真實 GPS API 端點的對映）
    let apiPath = url.pathname;
    if (apiPath.startsWith('/api/gps/')) {
      apiPath = apiPath.substring('/api/gps/'.length);
    } else if (apiPath.startsWith('/api/gps')) {
      apiPath = apiPath.substring('/api/gps'.length);
    }

    const targetUrl = new URL(`https://${gpsServer}/${apiPath}${url.search}`);
    console.log('[GPS Proxy] JSON API:', targetUrl.toString());
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!['host', 'cf-connecting-ip', 'cf-ray'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }

    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return errorResponse('Proxy error: ' + String(error), 502);
  }
}

// ============ 統一錯誤響應 ============
function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-gps-jsession, Cookie, Origin, Accept, Accept-Language, Range',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  });
}