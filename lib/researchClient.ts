import { supabase } from './supabaseClient';
export interface ResearchTool { id:string; label:string; group:string; description:string; target:boolean; keywords:boolean; }
export interface ResearchRun { id:string; input:any; status:string; createdAt:string; revision?:number; startedAt?:string; finishedAt?:string; error?:string; events?:any[]; result?:any; }
const base=()=>{if(typeof window!=='undefined'&&window.location.protocol.startsWith('http')&&!window.location.hostname.endsWith('vercel.app'))return window.location.origin;throw Error('Research requires the authenticated same-origin workspace at https://echo-ben.tailfdbc33.ts.net.');};
export async function researchRequest(route:string,init:RequestInit={}) {
 const {data}=await supabase.auth.getSession();if(!data.session?.access_token)throw Error('Sign in again before running research.');
 const response=await fetch(base()+'/api/research'+route,{...init,headers:{'content-type':'application/json',Authorization:`Bearer ${data.session.access_token}`,...init.headers},signal:init.signal||AbortSignal.timeout(20000)});
 const body=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(Error(body.error||'Research request failed.'),{status:response.status});return body;
}
export function downloadResearch(name:string,text:string,type='application/json') {const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function researchCsv(rows:any[]) {const fields=[...new Set(rows.flatMap(row=>Object.keys(row||{})))];const cell=(value:any)=>{let s=typeof value==='object'?JSON.stringify(value):String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};return [fields.map(cell).join(','),...rows.map(row=>fields.map(key=>cell(row[key])).join(','))].join('\r\n');}
