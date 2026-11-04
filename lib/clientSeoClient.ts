import {supabase}from'./supabaseClient';
export async function clientSeoRequest(owner:string,route:string,init:RequestInit={}){
 if(!location.protocol.startsWith('http')||location.hostname.endsWith('vercel.app'))throw Error('Open the connected Portal to use saved client workspaces.');
 const {data}=await supabase.auth.getSession();if(!data.session||data.session.user.id!==owner)throw Error('The signed-in account changed. Reopen this workspace.');
 const response=await fetch(location.origin+'/api/client-seo'+route,{...init,headers:{...init.headers,'content-type':'application/json',Authorization:`Bearer ${data.session.access_token}`},signal:init.signal||AbortSignal.timeout(20000)});
 const body=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(Error(body.error||'Client workspace request failed'),{status:response.status,data:body});return body;
}
