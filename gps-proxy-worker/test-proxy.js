/**
 * Simple Node.js GPS Proxy for testing
 */

const http = require('http');
const https = require('https');

const GPS_SERVER = 'console.onefleet.hk';
const GPS_VIDEO_PORT = '6604';
const ADMIN_ACCOUNT = 'admin';
const ADMIN_PASSWORD_MD5 = '4FF4C011268967DF32B6253CA0E7BDF0';

let cachedAdminSession = null;
let cachedAdminSessionTime = 0;
const ADMIN_SESSION_CACHE_TTL = 5 * 60 * 1000;

async function loginAdminSession() {
  try {
    const loginUrl = `https://${GPS_SERVER}/StandardApiAction_login.action`;
    const body = `account=${ADMIN_ACCOUNT}&password=${ADMIN_PASSWORD_MD5}`;

    console.log('[Test] Logging in to:', loginUrl);

    return new Promise((resolve, reject) => {
      const req = https.request(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log('[Test] Login response status:', res.statusCode);
          console.log('[Test] Login response:', data.substring(0, 300));
          try {
            const json = JSON.parse(data);
            if (json.result === 0 && json.jsession) {
              console.log('[Test] Login success!');
              resolve(json.jsession);
            } else {
              console.log('[Test] Login failed:', json.message);
              resolve(null);
            }
          } catch (e) {
            console.error('[Test] Failed to parse:', e);
            resolve(null);
          }
        });
      });
      req.on('error', e => {
        console.error('[Test] Login error:', e.message);
        resolve(null);
      });
      req.write(body);
      req.end();
    });
  } catch (error) {
    console.error('[Test] Admin login error:', error);
    return null;
  }
}

async function getValidAdminSession() {
  const now = Date.now();
  if (cachedAdminSession && (now - cachedAdminSessionTime) < ADMIN_SESSION_CACHE_TTL) {
    console.log('[Test] Using cached session');
    return cachedAdminSession;
  }

  console.log('[Test] Getting new admin session...');
  const newSession = await loginAdminSession();
  if (newSession) {
    cachedAdminSession = newSession;
    cachedAdminSessionTime = now;
  }
  return newSession;
}

async function handleFlvStream(devIdno, channel, stream) {
  const jsession = await getValidAdminSession();
  if (!jsession) {
    return { error: 'No session' };
  }

  const flvUrl = `http://${GPS_SERVER}:${GPS_VIDEO_PORT}/3/3?AVType=1&jsession=${encodeURIComponent(jsession)}&DevIDNO=${encodeURIComponent(devIdno)}&Channel=${channel}&Stream=${stream}`;

  console.log('[Test] FLV URL:', flvUrl);

  return new Promise((resolve) => {
    http.get(flvUrl, {
      headers: {
        'Accept': 'video/x-flv, application/octet-stream, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    }, (res) => {
      console.log('[Test] FLV response status:', res.statusCode);
      console.log('[Test] FLV content-type:', res.headers['content-type']);
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(data);
        console.log('[Test] FLV size:', buf.length);
        console.log('[Test] FLV first bytes:', buf.slice(0, 20).toString('hex'));
        console.log('[Test] Is FLV:', buf.slice(0, 3).toString() === 'FLV');
        resolve({ status: res.statusCode, size: buf.length, isFlv: buf.slice(0, 3).toString() === 'FLV' });
      });
    }).on('error', e => {
      console.error('[Test] FLV error:', e.message);
      resolve({ error: e.message });
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  console.log('[Test] Request:', req.method, url.pathname);

  if (url.pathname === '/flv-stream') {
    const devIdno = url.searchParams.get('devIdno') || '';
    const channel = url.searchParams.get('channel') || '0';
    const stream = url.searchParams.get('stream') || '0';

    const result = await handleFlvStream(devIdno, channel, stream);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(3000, () => {
  console.log('[Test] Server running on http://localhost:3000');
  console.log('[Test] Test URL: http://localhost:3000/flv-stream?devIdno=018270196339&channel=0&stream=1');
});
