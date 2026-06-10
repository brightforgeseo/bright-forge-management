const https = require('https');

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host'
]);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization,apikey,content-type,x-client-info,prefer,accept-profile,content-profile,range,range-unit,x-supabase-api-version'
  );
  res.setHeader('Access-Control-Expose-Headers', 'content-range,range-unit,content-location');
}

function requestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function copyRequestHeaders(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase()) && value !== undefined) {
      headers[key] = value;
    }
  }
  return headers;
}

function copyResponseHeaders(upstream, res) {
  for (const [key, value] of Object.entries(upstream.headers || {})) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase()) && value !== undefined) {
      res.setHeader(key, value);
    }
  }
}

function targetPath(req, mountPath, queryPath) {
  const rawUrl = req.url || '';
  const query = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?')) : '';
  const pathPart = Array.isArray(queryPath) ? queryPath.join('/') : (queryPath || '');
  return `/${pathPart}${query}`;
}

async function proxy(req, res, { targetHost, targetPort, mountPath, path }) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const body = await requestBody(req);
  const headers = copyRequestHeaders(req);
  if (body.length) headers['content-length'] = String(body.length);

  const options = {
    protocol: 'https:',
    hostname: targetHost,
    port: targetPort,
    path: targetPath(req, mountPath, path),
    method: req.method,
    headers,
    servername: targetHost,
    rejectUnauthorized: false
  };

  const upstream = https.request(options, upstreamRes => {
    res.statusCode = upstreamRes.statusCode || 502;
    copyResponseHeaders(upstreamRes, res);
    cors(res);
    upstreamRes.pipe(res);
  });

  upstream.on('error', error => {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    cors(res);
    res.end(JSON.stringify({ error: 'Proxy upstream error', message: error.message }));
  });

  if (body.length) upstream.write(body);
  upstream.end();
}

module.exports = { proxy };
