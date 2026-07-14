/**
 * GPS API proxy — Vercel Serverless Function
 *
 * Mirrors the behavior of server/gpsProxy.js (the localhost:3001 node dev proxy),
 * so that the Expo web build can talk to `https://console.onefleet.hk` via the
 * same /api/gps/* prefix in production.
 *
 * Why this exists: console.onefleet.hk doesn't send CORS headers, so the browser
 * can't call it directly. The web client (utils/gps808Api.ts) routes every
 * request through `EXPO_PUBLIC_GPS_PROXY_URL`, which on localhost is
 * http://localhost:3001/api/gps, and on Vercel becomes this function at /api/gps.
 *
 * Session handling: stateless. The web client stores JSESSIONID in localStorage
 * and sends it back as `x-gps-jsession` (see utils/gps808Api.ts → httpRequest).
 * The serverless function just forwards it as a Cookie header. There is no
 * server-side session store because Vercel Functions are stateless.
 */

const GPS_SERVER = 'console.onefleet.hk';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-gps-jsession, accept, origin, user-agent',
  );
  res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie, x-session-status');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Path is /api/gps/<upstream path>. Strip the prefix.
  // req.url is the full path including query string.
  const rawUrl = req.url || '/';
  const pathWithQuery = rawUrl.replace(/^\/api\/gps/, '') || '/';
  if (pathWithQuery === '/' || pathWithQuery === '') {
    res.status(400).json({ error: 'Missing upstream path, e.g. /api/gps/StandardApiAction_login.action' });
    return;
  }

  // Split into path + query
  const [upstreamPath, queryString = ''] = pathWithQuery.split('?');
  const targetUrl = `https://${GPS_SERVER}${upstreamPath}${queryString ? `?${queryString}` : ''}`;

  // Build headers, forwarding the client-supplied JSESSION if any
  const headers = {
    Host: GPS_SERVER,
    'User-Agent': 'FleetPro/1.0 (Vercel Serverless Proxy)',
    Accept: req.headers.accept || 'application/json, text/plain, */*',
    'Accept-Language': req.headers['accept-language'] || 'zh-TW,zh;q=0.9,en;q=0.8',
    Origin: 'https://console.onefleet.hk',
    Referer: 'https://console.onefleet.hk/',
  };

  // Body for POST/PUT
  let bodyBuf;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    headers['Content-Length'] = String(req.body ? Buffer.byteLength(req.body) : 0);
    bodyBuf = req.body;
  }

  const clientJsession = req.headers['x-gps-jsession'];
  if (clientJsession) {
    headers['Cookie'] = `JSESSIONID=${clientJsession}`;
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: bodyBuf,
      redirect: 'follow',
    });

    const setCookie = upstream.headers.get('set-cookie');
    const respHeaders = {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
    };
    if (setCookie) {
      // On login the server sets a fresh JSESSIONID. Surface it as
      // `x-session-value` so the client can pick it up reliably — browsers
      // strip Set-Cookie from cross-origin fetch responses.
      const match = setCookie.match(/(?:JSESSIONID|jsessionId)=([^;]+)/i);
      if (match) {
        const newSession = match[1];
        respHeaders['x-session-value'] = newSession;
        respHeaders['Access-Control-Expose-Headers'] =
          'Set-Cookie, x-session-status, x-session-value';

        // Rewrite the JSON body so the client (which expects the old
        // localhost proxy's _proxySession field) sees the new session.
        const text = await upstream.text();
        if (text && (respHeaders['Content-Type'] || '').includes('application/json')) {
          try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
              parsed._proxySession = newSession;
              res.status(upstream.status).set(respHeaders).send(JSON.stringify(parsed));
              return;
            }
          } catch {
            // non-JSON; fall through to raw body
          }
        }
        res.status(upstream.status).set(respHeaders).send(text);
        return;
      }
      respHeaders['Set-Cookie'] = setCookie;
    }
    const text = await upstream.text();
    res.status(upstream.status).set(respHeaders).send(text);
  } catch (err) {
    console.error('[api/gps] Upstream error:', err);
    res.status(502).json({ error: err.message || 'Upstream unreachable', result: -1 });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};