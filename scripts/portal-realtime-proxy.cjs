'use strict';
const { WebSocket, WebSocketServer } = require('ws');
const { publicProxyAllowed, realtimeMessage } = require('./portal-proxy-policy.cjs');

// Terminate each side: ws validates masking, UTF-8, frame lengths, fragmentation
// and control frames. No uninspected client bytes are piped to the upstream.
function createRealtimeProxy({ upstreamUrl, maxPayload = 256 * 1024, maxBuffered = 1024 * 1024,
  maxConnections = 200, handshakeTimeout = 5000, idleTimeout = 120000 }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload, perMessageDeflate: false });
  let connections = 0;
  const reject = (socket, status = 403) => socket.end(
    `HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  return (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://portal.invalid'); } catch { return reject(socket); }
    if (url.pathname !== '/supabase/realtime/v1/websocket' || !publicProxyAllowed(req) ||
        req.headers['sec-websocket-protocol'] || connections >= maxConnections) return reject(socket);
    const versions = url.searchParams.getAll('vsn');
    if (versions.length > 1 || (versions.length === 1 && !['1.0.0', '2.0.0'].includes(versions[0]))) return reject(socket);
    wss.handleUpgrade(req, socket, head, client => {
      connections++;
      let finished = false, queued = [], queuedBytes = 0;
      const target = new URL(upstreamUrl);
      target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
      target.pathname = '/realtime/v1/websocket';
      target.search = url.search;
      // Do not forward client-controlled handshake internals or cookies.
      const headers = {};
      for (const key of ['authorization', 'apikey', 'x-client-info']) {
        if (req.headers[key]) headers[key] = req.headers[key];
      }
      const upstream = new WebSocket(target, { headers, maxPayload, perMessageDeflate: false, handshakeTimeout });
      let idle;
      const finish = (code = 1008, reason = 'Realtime policy rejected') => {
        if (finished) return;
        finished = true; connections--; clearTimeout(idle); queued = []; queuedBytes = 0;
        for (const peer of [client, upstream]) {
          if (peer.readyState === WebSocket.OPEN) peer.close(code, reason);
          else if (peer.readyState === WebSocket.CONNECTING) peer.terminate();
        }
        const force = setTimeout(() => { client.terminate(); upstream.terminate(); }, 1000);
        force.unref();
      };
      const touch = () => { clearTimeout(idle); idle = setTimeout(() => finish(1001, 'Realtime idle timeout'), idleTimeout); idle.unref(); };
      const send = (peer, data, binary = Buffer.isBuffer(data)) => {
        if (finished) return;
        if (peer.readyState !== WebSocket.OPEN || peer.bufferedAmount + Buffer.byteLength(data) > maxBuffered) {
          finish(1009, 'Realtime buffer limit'); return;
        }
        peer.send(data, { binary }, err => { if (err) finish(1011, 'Realtime transport error'); });
      };
      touch();
      client.on('message', (data, binary) => {
        touch();
        const safe = realtimeMessage(data, binary);
        if (safe === null) return finish();
        if (upstream.readyState === WebSocket.CONNECTING) {
          queuedBytes += Buffer.byteLength(safe);
          if (queuedBytes > maxBuffered || queued.length >= 64) return finish(1009, 'Realtime queue limit');
          queued.push(safe);
        } else send(upstream, safe);
      });
      upstream.on('open', () => {
        if (finished) return upstream.terminate();
        for (const data of queued) { if (finished) break; send(upstream, data); }
        queued = []; queuedBytes = 0;
      });
      upstream.on('message', (data, binary) => { touch(); send(client, data, binary); });
      // ws automatically answers ping with pong on each terminated connection.
      client.on('ping', touch); client.on('pong', touch);
      upstream.on('ping', touch); upstream.on('pong', touch);
      client.on('error', () => finish(1011, 'Realtime transport error'));
      upstream.on('error', () => finish(1011, 'Realtime upstream unavailable'));
      client.on('close', () => finish(1000, 'Realtime closed'));
      upstream.on('close', () => finish(1012, 'Realtime reconnect required'));
    });
  };
}
module.exports = { createRealtimeProxy };
