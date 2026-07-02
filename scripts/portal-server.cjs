#!/usr/bin/env node
// All-in-one local portal server.
//
// Serves the whole app from this machine so the team can reach it through the
// Tailscale Funnel with nothing else in the path:
//
//   /            -> static files from dist/ (SPA fallback to index.html)
//   /supabase/*  -> local Supabase API (http://127.0.0.1:54321), INCLUDING
//                   WebSocket upgrades so Realtime presence/badges work
//   /api/uploads -> streams the body into Supabase Storage server-side
//   /healthz     -> "ok"
//
// Start it with `npm run portal:server`, then expose it:
//   tailscale funnel --bg 8080
//
// Environment overrides:
//   PORT                       listen port            (default 8080)
//   SUPABASE_INTERNAL_URL      local Supabase API     (default http://127.0.0.1:54321)
//   SUPABASE_SERVICE_ROLE_KEY  key used for uploads   (default: demo service key)
//                              MUST be updated when the demo JWT secret is
//                              rotated - see SECURITY_ROTATE_SUPABASE_KEYS.md

const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT) || 8080;
const SUPABASE_URL = new URL(process.env.SUPABASE_INTERNAL_URL || 'http://127.0.0.1:54321');
// Default service-role JWT for the stock supabase-demo secret. This is the
// publicly documented demo key (same family as the anon key the app ships
// with) - it only works until the JWT secret is rotated, at which point set
// SUPABASE_SERVICE_ROLE_KEY in the environment instead.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const DIST = path.resolve(__dirname, '..', 'dist');
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
};

const log = (msg) => console.log(`[portal ${new Date().toISOString()}] ${msg}`);

// ---- /supabase/* HTTP proxy -------------------------------------------------

const proxySupabase = (req, res) => {
  const targetPath = req.url.replace(/^\/supabase/, '') || '/';
  const headers = { ...req.headers, host: SUPABASE_URL.host };
  delete headers.connection;
  const upstream = http.request(
    { hostname: SUPABASE_URL.hostname, port: SUPABASE_URL.port, path: targetPath, method: req.method, headers },
    (ur) => {
      res.writeHead(ur.statusCode || 502, ur.headers);
      ur.pipe(res);
    }
  );
  upstream.on('error', (e) => {
    log(`supabase proxy error ${req.method} ${targetPath}: ${e.message}`);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Supabase unreachable');
  });
  req.pipe(upstream);
};

// ---- /api/uploads -----------------------------------------------------------

// The funnel exposes this server to the whole internet, so uploads require a
// logged-in portal user. Tokens are verified against Supabase auth and the
// result is cached briefly to keep uploads snappy.
const tokenCache = new Map(); // token -> cache expiry (ms epoch)

const verifyUserToken = (token, callback) => {
  const cached = tokenCache.get(token);
  if (cached && cached > Date.now()) return callback(true);
  const check = http.request(
    {
      hostname: SUPABASE_URL.hostname,
      port: SUPABASE_URL.port,
      path: '/auth/v1/user',
      method: 'GET',
      headers: { apikey: ANON_KEY, authorization: `Bearer ${token}` },
    },
    (ur) => {
      ur.resume();
      const ok = ur.statusCode === 200;
      if (ok) {
        if (tokenCache.size > 500) tokenCache.clear();
        tokenCache.set(token, Date.now() + 5 * 60 * 1000);
      }
      callback(ok);
    }
  );
  check.on('error', () => callback(false));
  check.end();
};

const handleUpload = (req, res, requestUrl) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    res.writeHead(401, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'login required to upload' }));
  }
  return verifyUserToken(token, (ok) => {
    if (!ok) {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid or expired session' }));
    }
    doUpload(req, res, requestUrl);
  });
};

const doUpload = (req, res, requestUrl) => {
  const bucket = (requestUrl.searchParams.get('bucket') || 'uploads').replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = (requestUrl.searchParams.get('filename') || `${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '');
  if (!bucket || !filename) {
    res.writeHead(400, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'bucket and filename are required' }));
  }
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_UPLOAD_BYTES) {
    res.writeHead(413, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'file too large' }));
  }

  const headers = {
    'content-type': req.headers['content-type'] || 'application/octet-stream',
    authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
  };
  if (req.headers['content-length']) headers['content-length'] = req.headers['content-length'];

  const upstream = http.request(
    {
      hostname: SUPABASE_URL.hostname,
      port: SUPABASE_URL.port,
      path: `/storage/v1/object/${bucket}/${encodeURIComponent(filename)}`,
      method: 'POST',
      headers,
    },
    (ur) => {
      let body = '';
      ur.on('data', (c) => { body += c; });
      ur.on('end', () => {
        if (ur.statusCode && ur.statusCode < 300) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ url: `/supabase/storage/v1/object/public/${bucket}/${filename}` }));
        } else {
          log(`upload failed ${ur.statusCode}: ${body.slice(0, 300)}`);
          res.writeHead(ur.statusCode || 502, { 'content-type': 'application/json' });
          res.end(body || JSON.stringify({ error: 'upload failed' }));
        }
      });
    }
  );
  upstream.on('error', (e) => {
    log(`upload proxy error: ${e.message}`);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Supabase storage unreachable' }));
  });

  let received = 0;
  req.on('data', (chunk) => {
    received += chunk.length;
    if (received > MAX_UPLOAD_BYTES) {
      upstream.destroy();
      res.writeHead(413, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'file too large' }));
      req.destroy();
    }
  });
  req.pipe(upstream);
};

// ---- static files from dist/ -------------------------------------------------

const serveStatic = (req, res, requestUrl) => {
  let pathname = decodeURIComponent(requestUrl.pathname);
  // Prevent path traversal
  pathname = path.posix.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST, pathname);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (pathname === '/' || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html'); // SPA fallback (covers /client-portal too)
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Portal build not found - run: npm run build');
  }
  const ext = path.extname(filePath).toLowerCase();
  const isIndex = filePath.endsWith('index.html');
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    // Hashed assets can cache forever; index.html must revalidate so new
    // builds (from the auto-deploy watcher) reach browsers immediately.
    'cache-control': isIndex ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(filePath).pipe(res);
};

// ---- server -------------------------------------------------------------------

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  if (req.url.startsWith('/supabase/')) return proxySupabase(req, res);
  if (requestUrl.pathname === '/api/uploads' && req.method === 'POST') return handleUpload(req, res, requestUrl);
  if (requestUrl.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok');
  }
  return serveStatic(req, res, requestUrl);
});

// WebSocket upgrades (Supabase Realtime) - this is what makes online badges
// and instant unread counts work through the funnel.
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/supabase/')) return socket.destroy();
  const targetPath = req.url.replace(/^\/supabase/, '');
  const upstream = net.connect(Number(SUPABASE_URL.port) || 80, SUPABASE_URL.hostname, () => {
    let raw = `${req.method} ${targetPath} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i];
      const value = name.toLowerCase() === 'host' ? SUPABASE_URL.host : req.rawHeaders[i + 1];
      raw += `${name}: ${value}\r\n`;
    }
    raw += '\r\n';
    upstream.write(raw);
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  const teardown = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on('error', teardown);
  socket.on('error', teardown);
});

server.listen(PORT, () => {
  log(`Portal server listening on http://localhost:${PORT}`);
  log(`  static:   ${DIST}`);
  log(`  supabase: ${SUPABASE_URL.href} (proxied at /supabase, websockets included)`);
  log(`  uploads:  POST /api/uploads`);
  log(`Expose to the team with: tailscale funnel --bg ${PORT}`);
});
