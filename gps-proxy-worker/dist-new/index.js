var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var DEFAULT_GPS_SERVER = "console.onefleet.hk";
var DEFAULT_GPS_VIDEO_PORT = "6604";
var DEFAULT_GPS_ADMIN_ACCOUNT = "admin";
var DEFAULT_GPS_ADMIN_PASSWORD_MD5 = "4FF4C011268967DF32B6253CA0E7BDF0";
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-gps-jsession, Cookie, Origin, Accept, Accept-Language, Range",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Expose-Headers": "Set-Cookie, JSESSIONID, Content-Length, Content-Range"
};
var adminSessionCache = null;
var adminSessionPromise = null;
async function getAdminSession(env) {
  if (adminSessionCache && adminSessionCache.expires > Date.now()) {
    return adminSessionCache.jsession;
  }
  if (adminSessionPromise) {
    return adminSessionPromise;
  }
  const gpsServer = env.GPS_SERVER || DEFAULT_GPS_SERVER;
  const account = env.GPS_ADMIN_ACCOUNT || DEFAULT_GPS_ADMIN_ACCOUNT;
  const password = env.GPS_ADMIN_PASSWORD_MD5 || DEFAULT_GPS_ADMIN_PASSWORD_MD5;
  adminSessionPromise = (async () => {
    try {
      const loginUrl = `https://${gpsServer}/StandardApiAction_login.action`;
      const body = new URLSearchParams({
        account,
        password
      }).toString();
      const response = await fetch(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        body
      });
      const text = await response.text();
      console.log("[GPS Proxy] Admin login response (first 300):", text.substring(0, 300));
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Admin login non-JSON response: " + text.substring(0, 200));
      }
      if (data.result !== 0 || !data.jsession) {
        throw new Error("Admin login failed: " + text.substring(0, 200));
      }
      const jsession = data.jsession;
      adminSessionCache = { jsession, expires: Date.now() + 25 * 60 * 1e3 };
      console.log("[GPS Proxy] Admin session cached:", jsession);
      return jsession;
    } catch (err) {
      console.error("[GPS Proxy] Admin login error:", err);
      throw err;
    } finally {
      adminSessionPromise = null;
    }
  })();
  return adminSessionPromise;
}
__name(getAdminSession, "getAdminSession");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;
    console.log(`[GPS Proxy] ${method}: ${pathname}`);
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: corsHeaders
      });
    }
    if (pathname.includes("/flv-stream")) {
      return handleFlvStream(request, url, env);
    }
    if (pathname.includes("/hls-stream")) {
      return handleHlsStream(request, url, env);
    }
    if (pathname.includes("/hls-segment")) {
      return handleHlsSegment(request, url, env);
    }
    if (pathname.includes("/video-url")) {
      return handleVideoUrl(request, url, env);
    }
    return handleJsonApi(request, url, env);
  }
};
async function handleFlvStream(request, url, env) {
  const gpsServer = env.GPS_SERVER || DEFAULT_GPS_SERVER;
  const gpsVideoPort = env.GPS_VIDEO_PORT || DEFAULT_GPS_VIDEO_PORT;
  const devIdno = url.searchParams.get("devIdno") || "";
  const channel = url.searchParams.get("channel") || "0";
  const stream = url.searchParams.get("stream") || "0";
  let jsessionId = url.searchParams.get("jsessionId") || "";
  if (!devIdno) {
    return errorResponse("Missing devIdno parameter", 400);
  }
  try {
    jsessionId = await getAdminSession(env);
    console.log("[GPS Proxy] Using admin session for FLV");
  } catch (err) {
    return errorResponse("Failed to obtain admin session: " + String(err), 502);
  }
  const flvUrl = `http://${gpsServer}:${gpsVideoPort}/3/3?AVType=1&jsession=${encodeURIComponent(jsessionId)}&DevIDNO=${encodeURIComponent(devIdno)}&Channel=${channel}&Stream=${stream}`;
  console.log("[GPS Proxy] FLV URL:", flvUrl);
  try {
    const response = await fetch(flvUrl, {
      headers: {
        "Accept": "video/x-flv, application/octet-stream, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) {
      console.error("[GPS Proxy] FLV upstream error:", response.status);
      return errorResponse("FLV upstream error: " + response.status, 502);
    }
    const reader = response.body?.getReader();
    if (!reader) {
      return errorResponse("No response body", 502);
    }
    const { value: firstChunk, done } = await reader.read();
    if (done || !firstChunk || firstChunk.length < 3) {
      return errorResponse("Empty response from upstream", 502);
    }
    const isFlv = firstChunk[0] === 70 && firstChunk[1] === 76 && firstChunk[2] === 86;
    if (!isFlv) {
      const errorText = new TextDecoder().decode(firstChunk);
      console.error("[GPS Proxy] Non-FLV content:", errorText.substring(0, 300));
      reader.cancel();
      adminSessionCache = null;
      return errorResponse("GPS server returned non-FLV content: " + errorText.substring(0, 200), 502);
    }
    reader.releaseLock();
    const transform = new TransformStream();
    const writer = transform.writable.getWriter();
    writer.write(firstChunk).catch(() => {
    });
    (async () => {
      try {
        const streamReader = response.body?.getReader();
        if (!streamReader) {
          await writer.close();
          return;
        }
        try {
          while (true) {
            const { value, done: done2 } = await streamReader.read();
            if (done2) break;
            if (value) {
              await writer.write(value);
            }
          }
        } finally {
          streamReader.releaseLock();
          await writer.close();
        }
      } catch (err) {
        console.error("[GPS Proxy] FLV background pipe error:", err);
        try {
          await writer.abort(err);
        } catch {
        }
      }
    })();
    return new Response(transform.readable, {
      status: 200,
      headers: {
        "Content-Type": "video/x-flv",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-gps-jsession, Cookie, Origin, Accept, Accept-Language, Range",
        "Access-Control-Max-Age": "86400",
        "Access-Control-Expose-Headers": "Content-Length, Content-Range",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    console.error("[GPS Proxy] FLV error:", error);
    return errorResponse("FLV stream error: " + String(error), 502);
  }
}
__name(handleFlvStream, "handleFlvStream");
async function handleHlsStream(request, url, env) {
  const gpsServer = env.GPS_SERVER || DEFAULT_GPS_SERVER;
  const gpsVideoPort = env.GPS_VIDEO_PORT || DEFAULT_GPS_VIDEO_PORT;
  const devIdno = url.searchParams.get("devIdno") || "";
  const channel = url.searchParams.get("channel") || "0";
  const stream = url.searchParams.get("stream") || "0";
  let jsessionId = url.searchParams.get("jsessionId") || "";
  if (!devIdno) {
    return errorResponse("Missing devIdno parameter", 400);
  }
  try {
    jsessionId = await getAdminSession(env);
  } catch (err) {
    return errorResponse("Failed to obtain admin session: " + String(err), 502);
  }
  const m3u8Filename = `1_${devIdno}_${channel}_${stream}.m3u8`;
  const hlsUrl = `http://${gpsServer}:${gpsVideoPort}/hls/${m3u8Filename}?jsession=${encodeURIComponent(jsessionId)}`;
  console.log("[GPS Proxy] HLS URL:", hlsUrl);
  try {
    const response = await fetch(hlsUrl, {
      headers: {
        "Accept": "*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (!response.ok) {
      console.error("[GPS Proxy] HLS upstream error:", response.status);
      return errorResponse("HLS upstream error: " + response.status, 502);
    }
    const text = await response.text();
    if (!text.includes(".m3u8") && !text.includes("#EXTM3U")) {
      console.error("[GPS Proxy] HLS non-m3u8 content:", text.substring(0, 300));
      adminSessionCache = null;
      return errorResponse("HLS non-m3u8 content: " + text.substring(0, 200), 502);
    }
    const rewrittenText = text.replace(
      /^(.+\.ts)$/gm,
      (match) => {
        const baseUrl = url.origin;
        const encodedTs = encodeURIComponent(match.trim());
        return `${baseUrl}/api/gps/hls-segment?ts=${encodedTs}&jsessionId=${encodeURIComponent(jsessionId)}`;
      }
    );
    return new Response(rewrittenText, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      }
    });
  } catch (error) {
    console.error("[GPS Proxy] HLS error:", error);
    return errorResponse("HLS stream error: " + String(error), 502);
  }
}
__name(handleHlsStream, "handleHlsStream");
async function handleHlsSegment(request, url, env) {
  const gpsServer = env.GPS_SERVER || DEFAULT_GPS_SERVER;
  const gpsVideoPort = env.GPS_VIDEO_PORT || DEFAULT_GPS_VIDEO_PORT;
  const tsName = url.searchParams.get("ts") || "";
  const jsessionId = url.searchParams.get("jsessionId") || "";
  if (!tsName) {
    return errorResponse("Missing ts parameter", 400);
  }
  const segmentUrl = `http://${gpsServer}:${gpsVideoPort}/hls/${tsName}?jsession=${encodeURIComponent(jsessionId)}`;
  try {
    const response = await fetch(segmentUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (!response.ok) {
      return errorResponse("HLS segment error: " + response.status, 502);
    }
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "video/mp2t",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=10"
      }
    });
  } catch (error) {
    return errorResponse("HLS segment error: " + String(error), 502);
  }
}
__name(handleHlsSegment, "handleHlsSegment");
async function handleVideoUrl(request, url, env) {
  const devIdno = url.searchParams.get("devIdno") || "";
  const channel = url.searchParams.get("channel") || "0";
  const stream = url.searchParams.get("stream") || "0";
  const baseUrl = url.origin;
  const flvUrl = `${baseUrl}/api/gps/flv-stream?devIdno=${encodeURIComponent(devIdno)}&channel=${channel}&stream=${stream}`;
  const hlsUrl = `${baseUrl}/api/gps/hls-stream?devIdno=${encodeURIComponent(devIdno)}&channel=${channel}&stream=${stream}`;
  return new Response(JSON.stringify({
    result: 0,
    flvUrl,
    hlsUrl,
    devIdno,
    channel: parseInt(channel, 10),
    stream: parseInt(stream, 10)
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(handleVideoUrl, "handleVideoUrl");
async function handleJsonApi(request, url, env) {
  const gpsServer = env.GPS_SERVER || DEFAULT_GPS_SERVER;
  try {
    let apiPath = url.pathname;
    if (apiPath.startsWith("/api/gps/")) {
      apiPath = apiPath.substring("/api/gps/".length);
    } else if (apiPath.startsWith("/api/gps")) {
      apiPath = apiPath.substring("/api/gps".length);
    }
    const targetUrl = new URL(`https://${gpsServer}/${apiPath}${url.search}`);
    console.log("[GPS Proxy] JSON API:", targetUrl.toString());
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!["host", "cf-connecting-ip", "cf-ray"].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.body
    });
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    return errorResponse("Proxy error: " + String(error), 502);
  }
}
__name(handleJsonApi, "handleJsonApi");
function errorResponse(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, x-gps-jsession, Cookie, Origin, Accept, Accept-Language, Range",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400"
    }
  });
}
__name(errorResponse, "errorResponse");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
