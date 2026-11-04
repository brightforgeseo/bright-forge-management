'use strict';

const nodeHttp = require('node:http');

function createEchoJobsHandler({
  normaliseEchoJob,
  verifyUserToken,
  SUPABASE_URL,
  SERVICE_KEY,
  maxRequestBytes,
  http = nodeHttp,
}) {
  const json = (res, status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(payload));
  };

  const readJsonBody = (req, callback) => {
    let received = 0;
    let body = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > maxRequestBytes) { tooLarge = true; return; }
      body += chunk;
    });
    req.on('end', () => {
      if (tooLarge) return callback(new Error('request body is too large'));
      try { callback(null, body ? JSON.parse(body) : {}); } catch { callback(new Error('invalid JSON')); }
    });
    req.on('error', callback);
  };

  const supabaseJson = (pathName, method, body, callback) => {
    const requestBody = body === undefined ? null : JSON.stringify(body);
    const headers = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, accept: 'application/json' };
    if (requestBody !== null) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(requestBody);
      headers.prefer = 'return=representation';
    }
    const upstream = http.request({ hostname: SUPABASE_URL.hostname, port: SUPABASE_URL.port, path: pathName, method, headers }, (ur) => {
      let responseBody = '';
      ur.on('data', (chunk) => { responseBody += chunk; });
      ur.on('end', () => {
        let data = null;
        try { data = responseBody ? JSON.parse(responseBody) : null; } catch {}
        callback(null, ur.statusCode || 502, data);
      });
    });
    upstream.on('error', callback);
    if (requestBody !== null) upstream.write(requestBody);
    upstream.end();
  };

  const sameOrigin = (req) => {
    const origin = req.headers.origin;
    if (!origin) return true; // native desktop clients and health tooling do not send Origin.
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    return origin === `${forwardedProto || 'http'}://${req.headers.host}`;
  };

  const authEchoRequest = (req, res, next) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same-origin request required' });
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return json(res, 401, { error: 'login required' });
    return verifyUserToken(token, (user) => user ? next(user) : json(res, 401, { error: 'invalid or expired session' }));
  };

  return (req, res, requestUrl) => authEchoRequest(req, res, (user) => {
    if (req.method === 'GET') {
      if (requestUrl.searchParams.has('artifact')) {
        const id = requestUrl.searchParams.get('artifact');
        const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([0-5])$/i.exec(id || '');
        if (!match) return json(res, 400, {error:'invalid artifact id'});
        // Recheck current membership; portal's token cache is not revocation authority.
        return supabaseJson(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, 'GET', undefined, (err, status, member) => {
          if (err || status !== 200) return json(res, 502, {error:'membership unavailable'});
          const confirmed = Date.parse(member?.email_confirmed_at), ban = member?.banned_until;
          if (member?.id !== user.id || !Number.isFinite(confirmed) || confirmed > Date.now() || member.deleted_at || (ban && (!Number.isFinite(Date.parse(ban)) || Date.parse(ban) > Date.now()))) return json(res, 403, {error:'active membership required'});
          return supabaseJson(`/rest/v1/echo_jobs?id=eq.${match[1]}&requested_by=eq.${encodeURIComponent(user.id)}&status=eq.succeeded&job_type=eq.chat&select=id,requested_by,job_type,status,result&limit=1`, 'GET', undefined, (error, code, rows) => {
            if (error || code !== 200) return json(res, 502, {error:'output unavailable'});
            const job = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
            const file = job?.result?.artifacts?.[Number(match[2])];
            const mime = {txt:'text/plain',md:'text/markdown',csv:'text/csv',json:'application/json',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
            if (!job || job.id !== match[1] || job.requested_by !== user.id || job.job_type !== 'chat' || job.status !== 'succeeded' || !file || typeof file.name !== 'string' || file.name.length > 180 || /[\x00-\x1f/\\]/.test(file.name) || !Object.hasOwn(mime,file.format) || !file.name.endsWith('.'+file.format) || typeof file.base64 !== 'string' || file.base64.length > 2796204 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) return json(res, 404, {error:'output unavailable'});
            const bytes = Buffer.from(file.base64,'base64');
            if (bytes.length > 2*1024*1024 || bytes.toString('base64') !== file.base64) return json(res,404,{error:'output unavailable'});
            return json(res,200,{artifact:{id,name:file.name,format:file.format,mime:mime[file.format],binary_base64:file.base64,content:''}});
          });
        });
      }
      const jobId = requestUrl.searchParams.get('id');
      if (jobId && !/^[0-9a-f-]{36}$/i.test(jobId)) return json(res, 400, { error: 'invalid job id' });
      const filters = [`requested_by=eq.${encodeURIComponent(user.id)}`];
      if (jobId) filters.push(`id=eq.${encodeURIComponent(jobId)}`);
      filters.push('select=id,job_type,status,attempts,max_attempts,result,error_code,error_message,created_at,started_at,finished_at');
      filters.push('order=created_at.desc');
      filters.push(`limit=${jobId ? 1 : 50}`);
      return supabaseJson(`/rest/v1/echo_jobs?${filters.join('&')}`, 'GET', undefined, (err, status, data) => {
        if (err) return json(res, 502, { error: 'Echo queue unavailable' });
        return json(res, status >= 200 && status < 300 ? 200 : status, { jobs: Array.isArray(data) ? data : [] });
      });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
    return readJsonBody(req, (bodyError, payload) => {
      if (bodyError) return json(res, 400, { error: bodyError.message });
      let job;
      try { job = normaliseEchoJob(payload); } catch (error) { return json(res, 400, { error: error.message }); }
      const create = () => supabaseJson('/rest/v1/echo_jobs', 'POST', {
        source_message_id: job.sourceMessageId || null,
        channel_id: job.channelId,
        parent_message_id: job.parentMessageId,
        requested_by: user.id,
        job_type: job.kind,
        payload: { message: job.message, history: job.history, sessionKey: job.sessionKey, attachments: job.attachments },
        max_attempts: job.maxAttempts,
      }, (err, status, data) => {
        if (err) return json(res, 502, { error: 'Echo queue unavailable' });
        if (status < 200 || status >= 300) return json(res, status, { error: 'could not queue Echo job' });
        return json(res, 202, { job: Array.isArray(data) ? data[0] : data });
      });
      if (!job.sourceMessageId) return create();
      // Do not let a user attach Echo to another person's message or channel.
      return supabaseJson(`/rest/v1/chat_messages?id=eq.${encodeURIComponent(job.sourceMessageId)}&sender_id=eq.${encodeURIComponent(user.id)}&select=id,channel_id`, 'GET', undefined, (err, status, rows) => {
        const source = Array.isArray(rows) ? rows[0] : null;
        if (err || status < 200 || status >= 300) return json(res, 502, { error: 'could not verify source message' });
        if (!source || (job.channelId && source.channel_id !== job.channelId)) return json(res, 403, { error: 'source message is not available to this user' });
        return create();
      });
    });
  });
}

module.exports = { createEchoJobsHandler };
