'use strict';
// Server only. Never trust renderer roles, editable user_metadata or allowed_users:
// the shipped schema permits every authenticated user to update that table.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function createUserManagementHandler({supabaseUrl, anonKey, serviceKey, ownerIds = [], timeoutMs = 8000}) {
  const owners = new Set(ownerIds.filter(id => UUID.test(id)).map(id => id.toLowerCase()));
  const reply = (res, status, data) => {
    res.writeHead(status, {'content-type':'application/json', 'cache-control':'no-store'});
    res.end(JSON.stringify(data));
  };
  const upstream = async (path, token, key, method = 'GET', body) => {
    const response = await fetch(new URL(path, supabaseUrl), {
      method, body:body ? JSON.stringify(body) : undefined,
      headers: {authorization:`Bearer ${token}`, apikey:key, 'content-type':'application/json'}, signal:AbortSignal.timeout(timeoutMs)
    });
    return {status:response.status, data:await response.json()};
  };
  return async (req, res) => {
    try {
      // file:// Electron has an opaque Origin. No cookies/credentials are allowed;
      // every actual request still needs a remotely verified owner bearer.
      if (req.headers.origin==='null') {
        res.setHeader('access-control-allow-origin','null');
        res.setHeader('vary','Origin');
        res.setHeader('access-control-allow-methods','GET, PATCH, DELETE, OPTIONS');
        res.setHeader('access-control-allow-headers','authorization, content-type');
      }
      if(req.method==='OPTIONS') {res.writeHead(204);return res.end();}
      const url = new URL(req.url, 'http://localhost');
      const token = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '')?.[1];
      if (!token) return reply(res,401,{error:'Authentication required'});
      if (!serviceKey || !anonKey || !owners.size) return reply(res,503,{error:'User management is not configured'});
      // No token cache: each request is checked by GoTrue, not locally decoded claims.
      const auth = await upstream('/auth/v1/user',token,anonKey);
      if (auth.status !== 200 || !UUID.test(auth.data?.id || '')) return reply(res,401,{error:'Invalid or expired session'});
      if (!owners.has(auth.data.id.toLowerCase())) return reply(res,403,{error:'Owner access required'});
      if (url.pathname.startsWith('/api/admin/users/')) {
        const id=url.pathname.slice('/api/admin/users/'.length);
        if (!UUID.test(id)) return reply(res,400,{error:'Invalid user ID'});
        if (!['DELETE','PATCH'].includes(req.method)) return reply(res,405,{error:'Method not allowed'});
        if (owners.has(id.toLowerCase())) return reply(res,409,{error:'Configured owner accounts are protected'});
        let body;
        if (req.method==='PATCH') {
          let raw='';
          for await (const chunk of req) { raw+=chunk; if (raw.length>4096) return reply(res,413,{error:'Request too large'}); }
          try { body=JSON.parse(raw); } catch { return reply(res,400,{error:'Invalid JSON'}); }
          if (typeof body.password!=='string' || body.password.length<12 || body.password.length>128 || Object.keys(body).some(k=>k!=='password')) return reply(res,400,{error:'Password must be 12 to 128 characters'});
          body={password:body.password};
        }
        const result=await upstream(`/auth/v1/admin/users/${id}`,serviceKey,serviceKey,req.method==='PATCH'?'PUT':'DELETE',body);
        if (result.status<200 || result.status>=300) return reply(res,502,{error:'User change failed'});
        return reply(res,200,{ok:true});
      }
      if (url.pathname !== '/api/admin/users') return reply(res,404,{error:'Not found'});
      if (req.method !== 'GET') return reply(res,405,{error:'Method not allowed'});
      const page=Number(url.searchParams.get('page') || 1), perPage=Number(url.searchParams.get('perPage') || 100);
      if (!Number.isSafeInteger(page) || page<1 || page>10000 || !Number.isSafeInteger(perPage) || perPage<1 || perPage>100) return reply(res,400,{error:'Invalid pagination'});
      const result=await upstream(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`,serviceKey,serviceKey);
      if (result.status!==200 || !Array.isArray(result.data?.users)) return reply(res,502,{error:'User directory unavailable'});
      const users=result.data.users.map(u=>({id:u.id,email:u.email || '',created_at:u.created_at,last_sign_in_at:u.last_sign_in_at || null,user_metadata:{full_name:u.user_metadata?.full_name || ''}}));
      return reply(res,200,{users,page,hasMore:users.length===perPage});
    } catch { return reply(res,502,{error:'User management upstream unavailable'}); }
  };
}
module.exports={createUserManagementHandler};
