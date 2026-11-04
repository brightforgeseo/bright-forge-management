'use strict';
function createBusinessAuthenticator({api,base,anonKey,request=fetch}){return async req=>{
 const match=/^Bearer ([^\s,]+)$/.exec(req.headers.authorization||'');if(!match)return null;
 const check=await request(new URL('/auth/v1/user',base),{signal:AbortSignal.timeout(10000),headers:{apikey:anonKey,authorization:'Bearer '+match[1]}});if(!check.ok)return null;
 const user=await check.json(),member=await api('/auth/v1/admin/users/'+encodeURIComponent(user.id));if(!member||member.id!==user.id)return null;
 const confirmed=Date.parse(member.email_confirmed_at),banned=member.banned_until;
 if(!Number.isFinite(confirmed)||confirmed>Date.now()||member.deleted_at||(banned&&(!Number.isFinite(Date.parse(banned))||Date.parse(banned)>Date.now())))return null;
 const allowed=await api('/rest/v1/allowed_users?email=eq.'+encodeURIComponent(member.email||'')+'&select=email&limit=1');if(!Array.isArray(allowed)||!allowed.length)return null;
 return {id:user.id};
};}
module.exports={createBusinessAuthenticator};
