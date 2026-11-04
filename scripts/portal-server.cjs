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
//   SUPABASE_SERVICE_ROLE_KEY  key used for uploads   (required; no fallback)
//                              MUST be updated when the demo JWT secret is
//                              rotated - see SECURITY_ROTATE_SUPABASE_KEYS.md

const http = require('node:http');
const { createRealtimeProxy } = require('./portal-realtime-proxy.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { normaliseEchoJob } = require('./echo-queue-core.cjs');
const { createEchoJobsHandler } = require('./portal-echo-jobs.cjs');
const { createBusinessInboxHandler } = require('./portal-business-inbox.cjs');
const { publicProxyAllowed } = require('./portal-proxy-policy.cjs');
const { makeLegacyNotificationHandler } = require('./portal-notification-compat.cjs');
const { createPrivateBotsHandler } = require('./portal-private-bots.cjs');
const { createPrivateBotAuthenticator, createPrivateBotWorker } = require('./private-bot-runtime.cjs');
const { createTelegramPortal, createTelegramCommands } = require('./private-bot-telegram.cjs');
const { startTelegramSocket } = require('./private-bot-telegram-socket.cjs');
const { createOrdinaryEchoWork } = require('./ordinary-echo-work.cjs');
const { createResearchHandler } = require('./portal-research.cjs');
const { createClientSeoHandler } = require('./portal-client-seo.cjs');
const { createBusinessAuthenticator } = require('./portal-business-auth.cjs');
const privateBotBuild=require('./private-bot-build.cjs');
privateBotBuild.initialise();

const PORT = Number(process.env.PORT) || 8080;
const SUPABASE_URL = new URL(process.env.SUPABASE_INTERNAL_URL || 'http://127.0.0.1:54321');
// Privileged credentials are required from the protected service environment.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SERVICE_KEY || !ANON_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are required');
}
const DIST = process.env.PORTAL_DIST_DIR ? path.resolve(process.env.PORTAL_DIST_DIR) : path.resolve(__dirname, '..', 'dist');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_ECHO_JOB_BYTES = 9 * 1024 * 1024; // six MiB of owner-supplied bytes plus base64/JSON
const MAX_INBOX_REQUEST_BYTES = 128 * 1024;

// Private workspaces never reuse general Echo authentication, history or execution.
const privateApi = async (route, method = 'GET', body) => {
  const response = await fetch(new URL(route, SUPABASE_URL), {
    method, signal: AbortSignal.timeout(15000),
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw Object.assign(new Error('private database request failed'), { status: response.status });
  return response.status === 204 ? null : response.json();
};
const privateAuthenticate = createPrivateBotAuthenticator({ api: privateApi, validate: async token => {
  const response = await fetch(new URL('/auth/v1/user', SUPABASE_URL), {
    signal: AbortSignal.timeout(10000), headers: { apikey: ANON_KEY, authorization: `Bearer ${token}` },
  });
  return response.ok ? response.json() : null;
} });
const handlePrivateBots = createPrivateBotsHandler({ authenticate: privateAuthenticate, api: privateApi, telegramPortal: createTelegramPortal({api:privateApi}) });
const privateWorker = createPrivateBotWorker({ api: privateApi, concurrency: 2 });
// Research is normal authenticated business work. Runs stay private to the
// requesting user; provider credentials and owner billing never reach the UI.
const authenticateBusiness=createBusinessAuthenticator({api:privateApi,base:SUPABASE_URL,anonKey:ANON_KEY});
const handleResearch=createResearchHandler({authenticate:authenticateBusiness,root:process.env.PORTAL_RESEARCH_ROOT||undefined});
const handleClientSeo=createClientSeoHandler({authenticate:authenticateBusiness,api:privateApi,readResearch:handleResearch.read});

const getPortalVersion = () => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
};

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

const handleLegacyNotification = makeLegacyNotificationHandler({supabaseUrl:SUPABASE_URL.toString(),anonKey:ANON_KEY});
const proxySupabase = (req, res) => {
  if (req.method === 'POST' && req.url.split('?')[0] === '/supabase/rest/v1/notifications') {
    return handleLegacyNotification(req, res);
  }
  if (!publicProxyAllowed(req)) {
    res.writeHead(403, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ error: 'privileged route unavailable on public proxy' }));
  }
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
    log('supabase proxy transport error'); // Never log credential-bearing URLs.
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Supabase unreachable');
  });
  req.pipe(upstream);
};

// ---- /api/uploads -----------------------------------------------------------

// The funnel exposes this server to the whole internet, so uploads require a
// logged-in portal user. Tokens are verified against Supabase auth and the
// result is cached briefly to keep uploads snappy.
const tokenCache = new Map(); // token -> { expiresAt, user }

const verifyUserToken = (token, callback) => {
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return callback(cached.user);
  const check = http.request(
    {
      hostname: SUPABASE_URL.hostname,
      port: SUPABASE_URL.port,
      path: '/auth/v1/user',
      method: 'GET',
      headers: { apikey: ANON_KEY, authorization: `Bearer ${token}` },
    },
    (ur) => {
      let body = '';
      ur.on('data', (chunk) => { body += chunk; });
      ur.on('end', () => {
        let user = null;
        if (ur.statusCode === 200) {
          try { user = JSON.parse(body); } catch {}
        }
        if (user?.id) {
          if (tokenCache.size > 500) tokenCache.clear();
          tokenCache.set(token, { expiresAt: Date.now() + 5 * 60 * 1000, user });
        }
        callback(user?.id ? user : null);
      });
    }
  );
  check.on('error', () => callback(false));
  check.end();
};

const handleEchoJobs = createEchoJobsHandler({
  normaliseEchoJob,
  verifyUserToken,
  SUPABASE_URL,
  SERVICE_KEY,
  maxRequestBytes: MAX_ECHO_JOB_BYTES,
});

const handleBusinessInbox = createBusinessInboxHandler({
  verifyUserToken,
  SUPABASE_URL,
  SERVICE_KEY,
  maxRequestBytes: MAX_INBOX_REQUEST_BYTES,
});

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
  const isAppShell = filePath.endsWith('index.html') || ['.js', '.css', '.webmanifest'].includes(ext);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    // During active portal release debugging, app-shell files must not be
    // served stale. Images/fonts can still cache normally.
    'cache-control': isAppShell ? 'no-store, no-cache, must-revalidate, max-age=0' : 'public, max-age=3600',
    ...(isAppShell ? { pragma: 'no-cache' } : {}),
  });
  fs.createReadStream(filePath).pipe(res);
};

// ---- server -------------------------------------------------------------------

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  if (requestUrl.pathname === '/api/client-seo' || requestUrl.pathname.startsWith('/api/client-seo/')) return handleClientSeo(req,res);
  if (requestUrl.pathname === '/api/research' || requestUrl.pathname.startsWith('/api/research/')) return handleResearch(req, res);
  if (req.url.startsWith('/supabase/')) return proxySupabase(req, res);
  if (requestUrl.pathname === '/api/private-bots' || requestUrl.pathname.startsWith('/api/private-bots/')) return handlePrivateBots(req, res);
  if (requestUrl.pathname === '/api/echo/jobs') return handleEchoJobs(req, res, requestUrl);
  if (requestUrl.pathname === '/api/business-inbox') return handleBusinessInbox(req, res);
  if (requestUrl.pathname === '/api/uploads' && req.method === 'POST') return handleUpload(req, res, requestUrl);
  if (requestUrl.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok');
  }
  if (requestUrl.pathname === '/version') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
    });
    return res.end(JSON.stringify({ version: getPortalVersion() }));
  }
  return serveStatic(req, res, requestUrl);
});

// WebSocket upgrades (Supabase Realtime) - this is what makes online badges
// and instant unread counts work through the funnel.
server.on('upgrade', createRealtimeProxy({ upstreamUrl: SUPABASE_URL }));

server.listen(PORT, () => {
  if (process.env.PRIVATE_BOT_WORKER_DISABLED !== '1') privateWorker.start().catch(() => log('Private bot worker unavailable; pending jobs remain persisted'));
  if (process.env.PRIVATE_BOT_WORKER_DISABLED !== '1') startTelegramSocket({command:createTelegramCommands({api:privateApi}),work:createOrdinaryEchoWork({api:privateApi})}).catch(() => log('Private Telegram socket unavailable'));
  log(`Portal server listening on http://localhost:${PORT}`);
  log(`  static:   ${DIST}`);
  log(`  supabase: ${SUPABASE_URL.href} (proxied at /supabase, websockets included)`);
  log(`  uploads:  POST /api/uploads`);
  log(`  Echo:     GET/POST /api/echo/jobs`);
  log(`  inbox:    POST /api/business-inbox`);
  log(`Expose to the team with: tailscale funnel --bg ${PORT}`);
});
