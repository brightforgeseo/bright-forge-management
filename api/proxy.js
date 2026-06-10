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

const TARGETS = {
  bridge: { host: 'echo-ai.tailfdbc33.ts.net', port: 8443 },
  supabase: { host: 'echo-ai.tailfdbc33.ts.net', port: 10000 }
};

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

function parseProxyPath(req) {
  const raw = req.query && req.query.proxyPath;
  const proxyPath = Array.isArray(raw) ? raw.join('/') : String(raw || '');
  const [service, ...rest] = proxyPath.split('/').filter(Boolean);
  return { service, upstreamPath: `/${rest.join('/')}` };
}

function upstreamQuery(req) {
  const entries = [];
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === 'proxyPath') continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== undefined) entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
    }
  }
  return entries.length ? `?${entries.join('&')}` : '';
}

module.exports = async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const { service, upstreamPath } = parseProxyPath(req);
  const target = TARGETS[service];

  if (!target) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Unknown proxy service', service }));
    return;
  }

  const body = await requestBody(req);
  const headers = copyRequestHeaders(req);
  if (body.length) headers['content-length'] = String(body.length);

  const options = {
    protocol: 'https:',
    hostname: target.host,
    port: target.port,
    path: `${upstreamPath}${upstreamQuery(req)}`,
    method: req.method,
    headers,
    servername: target.host,
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
};
