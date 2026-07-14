/**
 * GPS API proxy — Vercel Serverless Function
 *
 * Mirrors the behavior of server/gpsProxy.js (the localhost:3001 node dev
 * proxy), so that the Expo web build can talk to console.onefleet.hk via the
 * same /api/gps/* prefix in production.
 *
 * Why this exists: console.onefleet.hk doesn't send CORS headers, so the
 * browser can't call it directly. The web client (utils/gps808Api.ts) routes
 * every request through `EXPO_PUBLIC_GPS_PROXY_URL`, which on localhost is
 * http://localhost:3001/api/gps and on Vercel becomes this function.
 *
 * Session handling: stateless. The client stores JSESSIONID in localStorage
 * and sends it back as `x-gps-jsession` (see utils/gps808Api.ts → httpRequest).
 * The serverless function just forwards that header as a Cookie. There is no
 * server-side session store because Vercel Functions are stateless.
 */

const GPS_SERVER = 'console.onefleet.hk';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS',
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-gps-jsession, accept, origin, user-agent',
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Set-Cookie, x-session-status, x-session-value',
  );
}

async function readBody(req) {
  // Read the raw body from the Node IncomingMessage.
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      resolve(undefined);
      return;
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // req.url → e.g. "/api/gps/StandardApiAction_login.action"
  const pathWithQuery = (req.url || '/').replace(/^\/api\/gps/, '') || '/';
  if (pathWithQuery === '/' || pathWithQuery === '') {
    res
      .status(400)
      .json({ error: 'Missing upstream path (e.g. /api/gps/StandardApiAction_login.action)' });
    return;
  }

  const [upstreamPath, queryString = ''] = pathWithQuery.split('?');
  const targetUrl = `https://${GPS_SERVER}${upstreamPath}${
    queryString ? `?${queryString}` : ''
  }`;

  const headers = {
    Host: GPS_SERVER,
    'User-Agent': 'FleetPro/1.0 (Vercel Serverless Proxy)',
    Accept: req.headers.accept || 'application/json, text/plain, */*',
    'Accept-Language':
      req.headers['accept-language'] || 'zh-TW,zh;q=0.9,en;q=0.8',
    Origin: 'https://console.onefleet.hk',
    Referer: 'https://console.onefleet.hk/',
  };

  const bodyBuf = await readBody(req);
  if (bodyBuf && bodyBuf.length > 0) {
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'];
    }
    headers['Content-Length'] = String(bodyBuf.length);
  }

  const clientJsession = req.headers['x-gps-jsession'];
  if (clientJsession) {
    headers['Cookie'] = `JSESSIONID=${clientJsession}`;
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : bodyBuf,
      redirect: 'follow',
    });
  } catch (err) {
    console.error('[api/gps] Upstream unreachable:', err);
    res.status(502).json({ error: err.message || 'Upstream unreachable', result: -1 });
    return;
  }

  const setCookie = upstream.headers.get('set-cookie');
  const contentType = upstream.headers.get('content-type') || 'application/json';

  if (setCookie) {
    const match = setCookie.match(/(?:JSESSIONID|jsessionId)=([^;]+)/i);
    if (match) {
      const newSession = match[1];
      // Surface the new session to the client in two complementary ways.
      // 1. As a header that the browser will expose cross-origin (because we
      //    have Access-Control-Expose-Headers above).
      res.setHeader('x-session-value', newSession);
      // 2. Embedded into the JSON body as `_proxySession` so the existing
      //    client code (utils/gps808Api.ts → login) keeps working without
      //    having to read response headers.
      const text = await upstream.text();
      if (text && contentType.includes('application/json')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object') {
            parsed._proxySession = newSession;
            res
              .status(upstream.status)
              .setHeader('Content-Type', contentType)
              .send(JSON.stringify(parsed));
            return;
          }
        } catch {
          // non-JSON; fall through and send raw
        }
      }
      res
        .status(upstream.status)
        .setHeader('Content-Type', contentType)
        .send(text);
      return;
    }
    res.setHeader('Set-Cookie', setCookie);
  }

  const text = await upstream.text();
  res.status(upstream.status).setHeader('Content-Type', contentType).send(text);
}

export const config = {
  api: {
    bodyParser: false,
  },
};