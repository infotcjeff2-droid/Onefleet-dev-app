var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var GPS_SERVER = "console.onefleet.hk";
var GPS_VIDEO_PORT = "6604";
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-gps-jsession, Cookie",
  "Access-Control-Max-Age": "86400"
};
var src_default = {
  async fetch(request) {
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
      return handleFlvStream(request, url);
    }
    if (pathname.includes("/hls-stream")) {
      return handleHlsStream(request, url);
    }
    if (pathname.includes("/hls-segment")) {
      return handleHlsSegment(request, url);
    }
    if (pathname.includes("/video-url")) {
      return handleVideoUrl(request, url);
    }
    return handleJsonApi(request, url);
  }
};
async function handleFlvStream(request, url) {
  const devIdno = url.searchParams.get("devIdno") || "";
  const channel = url.searchParams.get("channel") || "0";
  const stream = url.searchParams.get("stream") || "0";
  const jsessionId = url.searchParams.get("jsessionId") || "";
  if (!devIdno) {
    return new Response("Missing devIdno parameter", { status: 400 });
  }
  const flvUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/3/3?AVType=1&jsession=${encodeURIComponent(jsessionId)}&DevIDNO=${encodeURIComponent(devIdno)}&Channel=${channel}&Stream=${stream}`;
  console.log("[GPS Proxy] FLV URL:", flvUrl);
  try {
    const response = await fetch(flvUrl, {
      headers: {
        "Accept": "video/x-flv, application/octet-stream, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    const status = response.status;
    const contentType = response.headers.get("content-type") || "";
    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    const firstBytes = Array.from(uint8Array.slice(0, 20)).map((b) => b.toString(16)).join(" ");
    console.log("[GPS Proxy] FLV response - status:", status, "content-type:", contentType, "first-bytes:", firstBytes, "size:", buffer.byteLength);
    const isFlv = firstBytes.startsWith("46 4c 56") || String.fromCharCode(uint8Array[0]) + String.fromCharCode(uint8Array[1]) + String.fromCharCode(uint8Array[2]) === "FLV";
    if (!isFlv && buffer.byteLength < 1e3) {
      const textDecoder = new TextDecoder();
      const text = textDecoder.decode(buffer);
      console.error("[GPS Proxy] Not FLV content:", text.substring(0, 300));
      return new Response(JSON.stringify({
        error: "Video server returned non-FLV content",
        status,
        contentType,
        firstBytes,
        preview: text.substring(0, 300)
      }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "video/x-flv",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Cache-Control": "no-cache"
      }
    });
  } catch (error) {
    console.error("[GPS Proxy] FLV error:", error);
    return new Response("FLV stream error: " + String(error), { status: 502 });
  }
}
__name(handleFlvStream, "handleFlvStream");
async function handleHlsStream(request, url) {
  const devIdno = url.searchParams.get("devIdno") || "";
  const channel = url.searchParams.get("channel") || "0";
  const stream = url.searchParams.get("stream") || "0";
  const jsessionId = url.searchParams.get("jsessionId") || "";
  const m3u8Filename = `1_${devIdno}_${channel}_${stream}.m3u8`;
  const hlsUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/hls/${m3u8Filename}?jsession=${encodeURIComponent(jsessionId)}`;
  console.log("[GPS Proxy] HLS URL:", hlsUrl);
  try {
    const response = await fetch(hlsUrl, {
      headers: {
        "Accept": "*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (!response.ok) {
      const text2 = await response.text();
      console.error("[GPS Proxy] HLS error response:", text2);
      return new Response(`HLS upstream error: ${response.status} ${text2.substring(0, 100)}`, {
        status: 502,
        headers: corsHeaders
      });
    }
    const text = await response.text();
    const proxyBase = getProxyBase(request);
    const segSession = jsessionId ? `&jsessionId=${encodeURIComponent(jsessionId)}` : "";
    const rewritten = text.split(/\r?\n/).map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return line;
      }
      if (trimmed.endsWith(".ts") || trimmed.includes(".ts?") || /^\d+\.ts/.test(trimmed)) {
        return `${proxyBase}/api/gps/hls-segment?url=${encodeURIComponent(trimmed)}${segSession}`;
      }
      return line;
    }).join("\n");
    return new Response(rewritten, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-cache"
      }
    });
  } catch (error) {
    console.error("[GPS Proxy] HLS error:", error);
    return new Response("HLS stream error: " + String(error), {
      status: 502,
      headers: corsHeaders
    });
  }
}
__name(handleHlsStream, "handleHlsStream");
async function handleHlsSegment(request, url) {
  const segmentUrl = url.searchParams.get("url") || "";
  if (!segmentUrl) {
    return new Response("Missing segment url", { status: 400 });
  }
  console.log("[GPS Proxy] Segment URL:", segmentUrl);
  try {
    const response = await fetch(segmentUrl, {
      headers: {
        "Accept": "*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": "video/mp2t",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=10"
      }
    });
  } catch (error) {
    console.error("[GPS Proxy] Segment error:", error);
    return new Response("Segment error: " + String(error), { status: 502 });
  }
}
__name(handleHlsSegment, "handleHlsSegment");
async function handleVideoUrl(request, url) {
  const devIdno = url.searchParams.get("devIdno") || "";
  const channel = url.searchParams.get("channel") || "0";
  const stream = url.searchParams.get("stream") || "0";
  const jsessionId = url.searchParams.get("jsessionId") || "";
  const proxyBase = getProxyBase(request);
  return Response.json({
    result: 0,
    videoUrl: `${proxyBase}/api/gps/flv-stream?devIdno=${encodeURIComponent(devIdno)}&channel=${channel}&stream=${stream}&jsessionId=${jsessionId}`,
    flvUrl: `${proxyBase}/api/gps/flv-stream?devIdno=${encodeURIComponent(devIdno)}&channel=${channel}&stream=${stream}&jsessionId=${jsessionId}`,
    hlsUrl: `${proxyBase}/api/gps/hls-stream?devIdno=${encodeURIComponent(devIdno)}&channel=${channel}&stream=${stream}&jsessionId=${jsessionId}`,
    devIdno,
    channel: parseInt(channel, 10),
    stream: parseInt(stream, 10)
  });
}
__name(handleVideoUrl, "handleVideoUrl");
async function handleJsonApi(request, url) {
  const apiPath = url.pathname.replace(/^\/api\/gps/, "");
  const queryString = url.search;
  const fullPath = queryString ? `${apiPath}${queryString}` : apiPath;
  const jsessionId = request.headers.get("x-gps-jsession") || url.searchParams.get("jsessionId") || "";
  const headers = {
    "Accept": "application/json"
  };
  if (jsessionId) {
    headers["Cookie"] = `JSESSIONID=${jsessionId}`;
  }
  const gpsUrl = `https://${GPS_SERVER}${fullPath}`;
  try {
    let response;
    if (request.method === "POST") {
      const body = await request.text();
      headers["Content-Type"] = request.headers.get("content-type") || "application/x-www-form-urlencoded";
      response = await fetch(gpsUrl, {
        method: "POST",
        headers,
        body
      });
    } else {
      response = await fetch(gpsUrl, { headers });
    }
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error("[GPS Proxy] API error:", error);
    return Response.json({ result: -1, error: String(error) }, { status: 502 });
  }
}
__name(handleJsonApi, "handleJsonApi");
function getProxyBase(request) {
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  return `${forwardedProto}://${forwardedHost}`;
}
__name(getProxyBase, "getProxyBase");
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
