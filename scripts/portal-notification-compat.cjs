'use strict';
// Transitional adapter for old web/Electron/Capacitor bundles. This is NOT a
// generic notification producer. Durable message/board transactions produce
// the notification. This endpoint only acknowledges a redundant legacy POST.
// Enable only after BOTH notification migrations are applied.
const makeLegacyNotificationHandler = ({supabaseUrl, anonKey, fetchImpl = fetch}) => {
  const base = String(supabaseUrl).replace(/\/$/, '');
  const send = (res, status, body) => {
    res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*'});
    res.end(JSON.stringify(body));
  };
  return async (req, res) => {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) return send(res,401,{error:'Authentication required'});
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk.toString('utf8');
        if (Buffer.byteLength(body) > 16384) {
          // Drain instead of destroying the socket before sending the 413.
          req.resume();
          return send(res,413,{error:'Notification compatibility payload too large'});
        }
      }
      let input;
      try { input=JSON.parse(body); } catch { return send(res,400,{error:'Invalid JSON'}); }
      if (!input || Array.isArray(input) || typeof input!=='object') return send(res,400,{error:'Expected an object'});
      const headers={apikey:anonKey, Authorization:authorization, 'Content-Type':'application/json'};
      const auth=await fetchImpl(`${base}/auth/v1/user`,{method:'GET',headers,signal:AbortSignal.timeout(10000)});
      if (!auth.ok) return send(res,401,{error:'Invalid or expired session'});
      const user=await auth.json();
      if (!user?.id) return send(res,401,{error:'Invalid session'});
      // The title is only a scheduling hint, never proof of recipient, due date
      // or content. The RPC reads all those facts and auth.uid() in PostgreSQL.
      if (['Task Due Today','Upcoming Task','Overdue Task'].includes(input.title)) {
        const result=await fetchImpl(`${base}/rest/v1/rpc/produce_due_notifications`,{
          method:'POST',headers,body:'{}',signal:AbortSignal.timeout(20000)
        });
        if (!result.ok) return send(res,502,{error:'Reminder producer unavailable'});
      }
      const receipt={id:null,notificationProducer:'source-events',ignoredLegacyInsert:true};
      // .insert().select().single() expects an object, but this receipt claims
      // no notification ID or delivery. Never echo arbitrary recipient/content.
      return send(res,200,req.headers.accept?.includes('application/vnd.pgrst.object+json') ? receipt : [receipt]);
    } catch {
      return send(res,502,{error:'Notification compatibility service unavailable'});
    }
  };
};
module.exports={makeLegacyNotificationHandler};
