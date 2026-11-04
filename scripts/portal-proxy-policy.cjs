'use strict';
const { posix } = require('node:path');
// Deny-only policy. Decoding JWT claims is NOT authentication: GoTrue/Realtime
// must still verify every allowed token's signature, expiry and permissions.
const CREDENTIALS = new Set(['authorization', 'apikey', 'access_token', 'x-api-key', 'token']);
function privilegedToken(value) {
  if (typeof value !== 'string') return false;
  const token = value.replace(/^Bearer\s+/i, '').trim();
  if (token.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'));
    return ['service_role', 'supabase_admin'].includes(payload.role);
  } catch { return false; }
}
function credentialAllowed(value) {
  // Credential carriers are singletons. Never let a downstream parser choose a
  // different item from a coalesced header/query value (even duplicate anon).
  return typeof value === 'string' && value.length > 0 && value.length <= 16384 &&
    !/[,\r\n]/.test(value) && !privilegedToken(value);
}
function publicProxyAllowed(req) {
  let url, path;
  try {
    url = new URL(req.url, 'http://portal.invalid');
    path = posix.normalize(decodeURIComponent(url.pathname));
  } catch { return false; }
  if (/^\/supabase\/auth\/v1\/admin(?:\/|$)/i.test(path)) return false;
  const rawSeen = new Set();
  const raw = req.rawHeaders || [];
  for (let i = 0; i < raw.length; i += 2) {
    const key = String(raw[i]).toLowerCase();
    if (!CREDENTIALS.has(key)) continue;
    if (rawSeen.has(key) || !credentialAllowed(raw[i + 1])) return false;
    rawSeen.add(key);
  }
  const headerSeen = new Set();
  for (const [name, value] of Object.entries(req.headers || {})) {
    const key = name.toLowerCase();
    if (!CREDENTIALS.has(key)) continue;
    if (headerSeen.has(key) || !credentialAllowed(value)) return false;
    headerSeen.add(key);
  }
  const querySeen = new Set();
  for (const [name, value] of url.searchParams) {
    const key = name.toLowerCase();
    if (!CREDENTIALS.has(key)) continue;
    if (querySeen.has(key) || !credentialAllowed(value)) return false;
    querySeen.add(key);
  }
  return true;
}
// Inspect parsed data, then forward canonical JSON, not ambiguous original bytes.
function payloadAllowed(value, depth = 0) {
  if (depth > 32) return false;
  if (typeof value === 'string') return !privilegedToken(value);
  if (value === null || typeof value !== 'object') return true;
  for (const [key, child] of Object.entries(value)) {
    if (CREDENTIALS.has(key.toLowerCase()) && child !== null && !credentialAllowed(child)) return false;
    if (!payloadAllowed(child, depth + 1)) return false;
  }
  return true;
}
function realtimeMessage(data, isBinary) {
  // Supabase/Phoenix v1 objects and v2 arrays use JSON for join/auth/heartbeat.
  // The installed SDK also uses kind=3 JSON-encoded binary *broadcasts* for
  // WebRTC signalling. This envelope has no transport auth event. Preserve it
  // after validating its exact layout and canonicalising its JSON payload.
  // Unknown/opaque binary formats, including binary auth pushes, fail closed.
  if (isBinary) {
    if (data.length < 6 || data[0] !== 3 || data[5] !== 1) return null;
    const end = 6 + data[1] + data[2] + data[3] + data[4];
    if (end >= data.length || data[3] === 0 || data[4] === 0) return null;
    let payload;
    try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(end))); }
    catch { return null; }
    if (!payloadAllowed(payload)) return null;
    return Buffer.concat([data.subarray(0, end), Buffer.from(JSON.stringify(payload))]);
  }
  let message;
  try { message = JSON.parse(data.toString('utf8')); } catch { return null; }
  const array = Array.isArray(message);
  if (array && message.length !== 5) return null;
  if (!message || typeof message !== 'object') return null;
  const topic = array ? message[2] : message.topic;
  const event = array ? message[3] : message.event;
  const payload = array ? message[4] : message.payload;
  if (typeof topic !== 'string' || typeof event !== 'string' || !payload ||
      typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (!payloadAllowed(message)) return null;
  return JSON.stringify(message);
}
module.exports = { publicProxyAllowed, privilegedToken, credentialAllowed, realtimeMessage };
