'use strict';

const nodeHttp = require('node:http');

function createBusinessInboxHandler({ verifyUserToken, SUPABASE_URL, SERVICE_KEY, maxRequestBytes, daemonPort = 18792, http = nodeHttp }) {
  const json = (res, status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(payload));
  };

  const sameOrigin = (req) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    return origin === `${forwardedProto || 'http'}://${req.headers.host}`;
  };

  const readBody = (req, callback) => {
    let received = 0;
    let body = '';
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received <= maxRequestBytes) body += chunk;
    });
    req.on('end', () => {
      if (received > maxRequestBytes) return callback(new Error('request body is too large'));
      try {
        const payload = body ? JSON.parse(body) : {};
        delete payload.userId;
        callback(null, JSON.stringify(payload));
      } catch {
        callback(new Error('invalid JSON'));
      }
    });
    req.on('error', callback);
  };

  const checkAdmin = (userId, callback) => {
    const path = `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`;
    const request = http.request({
      hostname: SUPABASE_URL.hostname,
      port: SUPABASE_URL.port,
      path,
      method: 'GET',
      headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, accept: 'application/json' },
    }, (upstream) => {
      let body = '';
      upstream.on('data', (chunk) => { body += chunk; });
      upstream.on('end', () => {
        try {
          const rows = JSON.parse(body);
          callback(upstream.statusCode === 200 && rows?.[0]?.role === 'Admin');
        } catch {
          callback(false);
        }
      });
    });
    request.on('error', () => callback(false));
    request.end();
  };

  const proxy = (res, body) => {
    const upstream = http.request({
      hostname: '127.0.0.1',
      port: daemonPort,
      path: '/',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (response) => {
      let responseBody = '';
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        let payload;
        try { payload = responseBody ? JSON.parse(responseBody) : {}; } catch { payload = { error: 'Mail service returned invalid JSON' }; }
        json(res, response.statusCode || 502, payload);
      });
    });
    upstream.on('error', () => json(res, 502, { error: 'Business inbox unavailable' }));
    upstream.end(body);
  };

  return (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same-origin request required' });
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return json(res, 401, { error: 'login required' });
    return verifyUserToken(token, (user) => {
      if (!user?.id) return json(res, 401, { error: 'invalid or expired session' });
      return checkAdmin(user.id, (allowed) => {
        if (!allowed) return json(res, 403, { error: 'admin access required' });
        if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
        return readBody(req, (error, body) => error ? json(res, 400, { error: error.message }) : proxy(res, body));
      });
    });
  };
}

module.exports = { createBusinessInboxHandler };
