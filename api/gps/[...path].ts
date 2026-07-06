/**
 * 808GPS CORS Proxy — Vercel Serverless Function.
 *
 * Mounted at /api/gps/* and forwards every request to
 * https://console.onefleet.hk/*, stripping the /api/gps prefix.
 *
 * The 808GPS server is JSESSION-cookie based, so we:
 *   - on the way IN:  accept the browser's x-gps-jsession header and
 *     rewrite it to a real Cookie: JSESSIONID=... header
 *   - on the way OUT: capture any Set-Cookie: JSESSIONID=... returned by
 *     808GPS and echo it back as x-gps-jsession (since browsers refuse
 *     to store cross-site cookies).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const TARGET_BASE = 'https://console.onefleet.hk';
const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];

export const config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS.join(','));
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Accept, Origin, x-gps-jsession',
    );
    res.setHeader('Access-Control-Max-Age', '86400');
    res.status(204).end();
    return;
  }

  // Strip /api/gps prefix, preserve query string, then forward upstream.
  const originalUrl = req.url ?? '';
  const rest = originalUrl.split('?')[0]?.replace(/^\/api\/gps/, '') ?? '';
  const queryString = originalUrl.includes('?') ? originalUrl.slice(originalUrl.indexOf('?')) : '';
  const url = `${TARGET_BASE}${rest}${queryString}`;

  const headers: Record<string, string> = {
    Accept: (req.headers.accept as string | undefined) ?? 'application/json',
  };
  const contentType = req.headers['content-type'];
  if (contentType) headers['Content-Type'] = contentType as string;

  const incomingSession = req.headers['x-gps-jsession'];
  if (incomingSession) {
    headers.Cookie = `JSESSIONID=${Array.isArray(incomingSession) ? incomingSession[0] : incomingSession}`;
  }

  let body: Uint8Array | undefined;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const raw = await readRawBody(req);
    body = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }

  try {
    const fetchBody = body && body.byteLength > 0 ? body : undefined;
    const upstream = await fetch(url, {
      method: req.method ?? 'GET',
      headers,
      ...(fetchBody ? { body: fetchBody as BodyInit } : {}),
      redirect: 'follow',
    });

    res.status(upstream.status);

    const upstreamContentType = upstream.headers.get('content-type');
    if (upstreamContentType) res.setHeader('Content-Type', upstreamContentType);

    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) {
      const sessionIds = setCookie
        .split(/,(?=\s*[A-Za-z0-9_-]+=)/)
        .map((c) => {
          const m = c.match(/JSESSIONID=([^;]+)/i);
          return m ? m[1] : null;
        })
        .filter((v): v is string => Boolean(v));
      if (sessionIds.length > 0) {
        res.setHeader('Access-Control-Expose-Headers', 'x-gps-jsession');
        res.setHeader('x-gps-jsession', sessionIds.join(','));
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    res.status(502).json({
      result: -1,
      error: `Proxy error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}