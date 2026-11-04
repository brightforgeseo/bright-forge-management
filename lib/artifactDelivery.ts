import { supabase } from './supabaseClient';
export type ArtifactRef = { id: string; botId?: string };
export type ArtifactReceipt = { status: 'saved' | 'initiated' | 'cancelled'; id: string; owner: string; name: string; mime: string; bytes: number; sha256: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDINARY = new RegExp(UUID.source.slice(0,-1) + '\\.[0-5]$', 'i');
const PORTAL = 'https://echo-ben.tailfdbc33.ts.net';
const MIME: Record<string,string> = {docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pdf:'application/pdf',csv:'text/csv',txt:'text/plain',md:'text/markdown',json:'application/json'};
export function artifactRef(raw: string, origin = window.location.origin): ArtifactRef | null {
  try {
    const u = new URL(raw, origin);
    if (![origin,PORTAL,'http://100.112.162.122:8080'].includes(u.origin) || !/^https?:$/.test(u.protocol) || u.username || u.password || u.hash) return null;
    if (u.pathname !== '/') return null;
    const ordinary=u.searchParams.get('ordinaryArtifact'), id=u.searchParams.get('privateArtifact'), botId=u.searchParams.get('privateBot');
    const keys=[...u.searchParams.keys()];
    if (ordinary && (UUID.test(ordinary) || ORDINARY.test(ordinary)) && keys.length===1) return {id:ordinary};
    if (id && botId && UUID.test(id) && UUID.test(botId) && keys.length===2 && keys.every(k=>['privateArtifact','privateBot'].includes(k))) return {id,botId};
  } catch {}
  return null;
}
// Delimiters belong to Markdown only in an actual link destination. Never repair IDs.
export function messageParts(text: string): string[] {
  const parts: string[] = []; const starts = /https?:\/\//gi; let cursor = 0, match: RegExpExecArray | null;
  while ((match = starts.exec(text))) {
    const start = match.index;
    const markdown = /\[[^\]\n]*\]\($/.test(text.slice(0, start));
    let end = start, depth = 0;
    while (end < text.length && !/[\s<>]/.test(text[end])) {
      const char = text[end];
      if (char === '(') depth++;
      if (char === ')') { if (markdown && depth === 0) break; depth--; }
      end++;
    }
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(text.slice(start, end)); cursor = end; starts.lastIndex = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
export function chatMessageParts(text: string): string[] {
  return messageParts(text).flatMap(part => /^https?:\/\//i.test(part) ? [part] : part.split(/(@everyone|@[\w\s]+?)(?=\s@|\s|$|[.,!?])/gi).filter(Boolean));
}
export async function downloadArtifact(ref: ArtifactRef, owner: string, isCurrent = () => true): Promise<ArtifactReceipt> {
  if (!(UUID.test(ref.id) || (!ref.botId && ORDINARY.test(ref.id))) || (ref.botId && !UUID.test(ref.botId)) || !UUID.test(owner)) throw Error('Invalid file identity.');
  const session = async (afterCommit = false) => {
    const {data}=await supabase.auth.getSession();
    if (!isCurrent() || !data.session || data.session.user.id!==owner) throw Error(afterCommit ? 'Your account session changed. Save cannot be confirmed; check the chosen location.' : 'Your account session changed. No file saved.');
    return data.session;
  };
  const before=await session();
  const origin=/^https?:$/.test(window.location.protocol) && !window.location.hostname.endsWith('vercel.app') ? window.location.origin : PORTAL;
  const route=ref.botId ? `${ref.botId}/artifacts/${ref.id}` : `ordinary/artifacts/${ref.id}`;
  const endpoint=!ref.botId && ORDINARY.test(ref.id) ? `${origin}/api/echo/jobs?artifact=${encodeURIComponent(ref.id)}` : `${origin}/api/private-bots/${route}`;
  const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${before.access_token}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(60000)});
  if (!response.ok) throw Error(response.status===401?'Sign in again to download this file.':response.status===404?'This file is unavailable for your account.':'File download failed. Your saved output is unchanged.');
  const {artifact:a}=await response.json();
  await session();
  if (!a || a.id!==ref.id || typeof a.name!=='string' || a.name.length>180 || /[\x00-\x1f/\\]/.test(a.name) || !a.name.endsWith('.'+a.format) || !MIME[a.format] || a.mime?.split(';')[0]!==MIME[a.format]) throw Error('Invalid file metadata. No file saved.');
  let bytes: Uint8Array;
  if (a.binary_base64) {
    if (typeof a.binary_base64!=='string' || a.binary_base64.length>12*1024*1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.binary_base64)) throw Error('Invalid file bytes.');
    const raw=atob(a.binary_base64); if (btoa(raw)!==a.binary_base64) throw Error('Invalid file bytes.');
    bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  } else {
    if (!['txt','md','csv','json'].includes(a.format) || typeof a.content!=='string') throw Error('Original file bytes are missing. No replacement generated.');
    bytes=new TextEncoder().encode(a.content);
  }
  if (!bytes.length || bytes.length>8*1024*1024 || (['docx','xlsx'].includes(a.format) && (bytes[0]!==80 || bytes[1]!==75 || bytes[2]!==3 || bytes[3]!==4))) throw Error('Original file bytes are invalid.');
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('');
  const receipt={id:ref.id,owner,name:a.name,mime:a.mime,bytes:bytes.length,sha256};
  await session();
  const native=window.electronAPI;
  if (native?.prepareArtifactSave && native.commitArtifactSave && native.cancelArtifactSave) {
    const prepared=await native.prepareArtifactSave({...receipt,data:bytes});
    if (prepared.status==='cancelled') { await session(); return {...receipt,status:'cancelled'}; }
    if (prepared.status!=='prepared' || !/^[0-9a-f]{64}$/.test(prepared.claim || '')) throw Error('Invalid native save claim.');
    const claim=prepared.claim!;
    try {
      // OS dialog has returned, but native has not opened or written a file yet.
      await session();
      const result=await native.commitArtifactSave({claim,...receipt});
      await session(true);
      if (result.status!=='saved' || result.sha256!==sha256 || result.bytes!==bytes.length) throw Error('Saved-file verification failed. Original output retained.');
      return {...receipt,status:'saved'};
    } finally { await native.cancelArtifactSave({claim}).catch(()=>{}); }
  }
  // Old one-step bridges are deliberately NOT used. 1.0.319 uses in-app Blob only.
  const url=URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>],{type:a.mime}));
  const link=document.createElement('a'); link.href=url; link.download=a.name;
  try { document.body.appendChild(link); link.click(); }
  finally { link.remove(); window.setTimeout(()=>URL.revokeObjectURL(url),60000); }
  await session(true);
  return {...receipt,status:'initiated'}; // Browser/Electron download event is not an OS-save receipt.
}
