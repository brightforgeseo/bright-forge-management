import React, { useEffect, useRef, useState } from 'react';
import { Bot, Check, Loader2, RefreshCw, Send, Settings2, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import ArtifactMessage from './ArtifactMessage';
import { downloadArtifact } from '../lib/artifactDelivery';
import { User, ToastType } from '../types';
interface PrivateBot { id: string; slot: number; name: string; instructions: string; context: string; owner_id: string; }
interface Job { id: string; bot_id: string; message: string; status: 'pending' | 'running' | 'completed' | 'failed'; response?: string; error_code?: string; created_at: string; tool_trace?:Array<{name:string;success:boolean;result:any}>; }
interface Props { currentUser: User; addToast: (type: ToastType, message: string) => void; }
const ORIGIN = typeof window !== 'undefined' && window.location.protocol.startsWith('http') && !window.location.hostname.endsWith('vercel.app') ? window.location.origin : 'https://echo-ben.tailfdbc33.ts.net';
async function request(expectedOwner: string, suffix = '', method = 'GET', payload?: object) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw Error('Sign in again to use your private bots.');
  if (data.session.user.id !== expectedOwner) throw Error('Your account session is changing. Reload before continuing.');
  const response = await fetch(`${ORIGIN}/api/private-bots${suffix}`, {
    method, signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${data.session.access_token}`, 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Private bots could not be loaded.');
  return result;
}
export default function PrivateBots({ currentUser, addToast }: Props) {
  const [dataOwner, setDataOwner] = useState(currentUser.id);
  const [bots, setBots] = useState<PrivateBot[]>([]);
  const [activeId, setActiveId] = useState('');
  const [jobs, setJobs] = useState<Record<string, Job[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [publicUrls, setPublicUrls] = useState<Record<string, string>>({});
  const [taskIds, setTaskIds] = useState<Record<string, string>>({});
  const [tasks, setTasks] = useState<Array<{id:string;title:string;client:string}>>([]);
  const [outputs,setOutputs]=useState<Array<{id:string;name:string}>>([]);
  const [showGoogle,setShowGoogle]=useState(false);
  const [google,setGoogle]=useState<any>({});
  const [googleFile,setGoogleFile]=useState('');
  const [googleBusy,setGoogleBusy]=useState(false);
  const googleCallback=useRef(false);
  const [showTelegram, setShowTelegram] = useState(false);
  const [telegram, setTelegram] = useState<any>({});
  const [linkCommand, setLinkCommand] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ name: '', instructions: '', context: '' });
  const generation = useRef(0);
  const pendingRequests=useRef<Record<string,{fingerprint:string;key:string}>>({});
  const [uploading,setUploading]=useState(false);
  const end = useRef<HTMLDivElement>(null);
  const active = bots.find(b => b.id === activeId);
  const ordinaryArtifact = new URLSearchParams(window.location.search).get('ordinaryArtifact');
  const transcript = jobs[activeId] || [];
  const busy = transcript.some(j => j.status === 'pending' || j.status === 'running');
  useEffect(() => {
    const current = ++generation.current; let alive = true;
    setDataOwner(currentUser.id); setSending(false); setSaving(false);
    setPublicUrls({}); setTaskIds({}); setTasks([]);
    setOutputs([]); setGoogle({}); setGoogleFile(''); setShowGoogle(false); setGoogleBusy(false);
    setShowTelegram(false); setTelegram({}); setLinkCommand('');
    setBots([]); setJobs({}); setDrafts({}); setActiveId(''); setEditing(false); setLoading(true); setError('');
    if (ordinaryArtifact) { setLoading(false); return () => { alive = false; generation.current++; }; }
    request(currentUser.id).then(result => {
      if (!alive || current !== generation.current) return;
      const wanted=new URLSearchParams(window.location.search).get('privateBot');
      setBots(result.bots); setActiveId(result.bots.find((b:PrivateBot)=>b.id===wanted)?.id || result.bots[0]?.id || '');
      if(wanted&&!result.bots.some((b:PrivateBot)=>b.id===wanted))setError('This file link does not belong to your signed-in account.');
    }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    request(currentUser.id, '/sources/tasks').then(result => { if (alive && current === generation.current) setTasks(result.tasks); }).catch(() => {});
    return () => { alive = false; generation.current++; };
  }, [currentUser.id]);
  useEffect(() => {
    if (!showTelegram) return;
    let alive = true; const current = generation.current;
    const refresh = () => request(currentUser.id, '/telegram').then(result => { if (alive && current === generation.current) setTelegram(result); }).catch(e=>{if(alive)setError(e.message);});
    refresh(); const timer = window.setInterval(refresh, 4000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [showTelegram,currentUser.id]);
  async function chooseGoogleFiles(){
    const current=generation.current;setGoogleBusy(true);
    try{
      const credentials=await request(currentUser.id,'/google/picker','POST',{});if(current!==generation.current)return;
      const w=window as any;
      if(!w.gapi)await new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src='https://apis.google.com/js/api.js';s.onload=()=>resolve();s.onerror=()=>reject(Error('Google Picker could not load.'));document.head.appendChild(s);});
      await new Promise<void>(resolve=>w.gapi.load('picker',resolve));if(current!==generation.current)return;
      const picker=w.google.picker;
      const docs=new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true);
      new picker.PickerBuilder().setDeveloperKey(credentials.developerKey).setAppId(credentials.appId).setOAuthToken(credentials.accessToken).setOrigin(window.location.origin).addView(docs).enableFeature(picker.Feature.MULTISELECT_ENABLED).setCallback((data:any)=>{
        if(current!==generation.current||data.action!==picker.Action.PICKED)return;
        const selected=data.docs||[],folder=selected.find((d:any)=>d.mimeType==='application/vnd.google-apps.folder'),file=selected.find((d:any)=>['application/vnd.google-apps.document','application/vnd.google-apps.spreadsheet'].includes(d.mimeType))||(folder&&googleFile?{id:googleFile}:null);
        if(!file){addToast('error','Select the assigned source Doc or Sheet, and its containing folder for derived outputs.');return;}
        setGoogleFile(file.id);googleAction('target',{fileId:file.id,...(folder?{folderId:folder.id}:{})});
      }).build().setVisible(true);
    }catch(e:any){if(current===generation.current)addToast('error',e.message);}finally{if(current===generation.current)setGoogleBusy(false);}
  }
  async function googleAction(action:string,payload:object={}){
    const current=generation.current;setGoogleBusy(true);
    try{const r=await request(currentUser.id,`/google${action?'/'+action:''}`,action?'POST':'DELETE',action?payload:undefined);if(current!==generation.current)return;
      if(r.url&&action==='start'){window.location.assign(r.url);return;}
      if(action==='read')addToast('success',`Verified exact file ${r.fileId}; edit permission: ${r.canEdit?'yes':'no'}. Content/render QA not run.`);
      const state=await request(currentUser.id,'/google');if(current===generation.current)setGoogle(state);
    }catch(e:any){if(current===generation.current)addToast('error',e.message);}finally{if(current===generation.current)setGoogleBusy(false);}
  }
  useEffect(()=>{
    const query=new URLSearchParams(window.location.search);
    if(!query.has('privateGoogleCallback')||googleCallback.current)return;
    googleCallback.current=true;const state=query.get('state'),code=query.get('code');
    window.history.replaceState(null,'',window.location.pathname);setShowGoogle(true);
    if(state&&code)googleAction('complete',{state,code});else setError('Google consent was not completed. No account linked.');
  },[currentUser.id]);
  useEffect(()=>{
    if(!showGoogle)return;let alive=true;const current=generation.current;
    request(currentUser.id,'/google').then(r=>{if(alive&&current===generation.current)setGoogle(r);}).catch(e=>{if(alive&&current===generation.current)setError(e.message);});return()=>{alive=false;};
  },[showGoogle,currentUser.id]);
  async function telegramAction(action: string, payload: object = {}) {
    const current = generation.current;
    try {
      const result = await request(currentUser.id, `/telegram${action ? '/'+action : ''}`, action ? 'POST' : 'DELETE', action ? payload : undefined);
      if(current !== generation.current)return;
      setLinkCommand(result.command || ''); const status = await request(currentUser.id, '/telegram'); if(current === generation.current)setTelegram(status);
    } catch(e:any) { if(current === generation.current)addToast('error',e.message); }
  }
  useEffect(() => {
    if (!bots.length) return;
    let alive = true; let polling = false; const current = generation.current;
    const poll = async () => {
      if (polling) return; polling = true;
      try {
        const pairs = await Promise.all(bots.map(async b => [b.id, (await request(currentUser.id, `/${b.id}/jobs`)).jobs.slice().reverse()] as [string, Job[]]));
        if (alive && current === generation.current) { setJobs(Object.fromEntries(pairs)); setError(''); }
      } catch (e: any) { if (alive) setError(e.message); }
      finally { polling = false; }
    };
    poll(); const timer = window.setInterval(poll, 4000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [bots, currentUser.id]);
  useEffect(()=>{
    setOutputs([]);if(!activeId)return;
    let alive=true;const current=generation.current;
    const refresh=()=>request(currentUser.id,`/${activeId}/artifacts`).then(r=>{if(alive&&current===generation.current)setOutputs(r.artifacts);}).catch(()=>{});
    refresh();const timer=window.setInterval(refresh,4000);return()=>{alive=false;window.clearInterval(timer);};
  },[activeId,currentUser.id]);
  async function downloadOutput(id:string,ordinary=false){
    const current=generation.current;
    try {
      const r=await downloadArtifact({id,...(ordinary?{}:{botId:activeId})},currentUser.id,()=>current===generation.current);
      if(current===generation.current)addToast(r.status==='cancelled'?'info':'success',r.status==='saved'?`Saved ${r.name}; SHA-256 ${r.sha256}`:r.status==='cancelled'?'Save cancelled. Original retained.':'Download started. This app version cannot confirm the file was saved.');
    } catch(e:any){if(current===generation.current)addToast('error',e.message);}
  }
  async function uploadFile(file:File){
    if(!active||uploading)return;const current=generation.current,id=activeId;setUploading(true);
    try{
      if(file.size>2*1024*1024)throw Error('File must be no larger than 2 MiB.');
      const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);
      const result=await request(currentUser.id,`/${id}/artifacts`,'POST',{name:file.name,format:file.name.split('.').pop()?.toLowerCase(),base64:btoa(raw),requestKey:crypto.randomUUID()});
      if(current!==generation.current)return;
      addToast('success','Private source file uploaded. Complex formatting is normalised.');
      setDrafts(previous=>({...previous,[id]:`${previous[id]||''}\nUse source file ${result.artifact.id} (${result.artifact.name}).`.trim()}));
    }catch(e:any){if(current===generation.current)addToast('error',e.message);}finally{if(current===generation.current)setUploading(false);}
  }
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [activeId, transcript.length, transcript.at(-1)?.status]);
  async function send(retryJobId?: string) {
    if (!active || sending || busy || (!retryJobId && !drafts[activeId]?.trim())) return;
    const id = activeId; const current = generation.current; setSending(true);
    try {
      const payload=retryJobId ? {retryJobId} : {message:drafts[id].trim(),...(publicUrls[id]?.trim()?{publicUrl:publicUrls[id].trim()}:{}),...(taskIds[id]?{taskId:taskIds[id]}:{})};
      const fingerprint=JSON.stringify(payload);if(pendingRequests.current[id]?.fingerprint!==fingerprint)pendingRequests.current[id]={fingerprint,key:crypto.randomUUID()};
      const result = await request(currentUser.id, `/${id}/jobs`, 'POST', {...payload,requestKey:pendingRequests.current[id].key});
      delete pendingRequests.current[id];
      if (current !== generation.current) return;
      setJobs(previous => ({ ...previous, [id]: [...(previous[id] || []), result.job] }));
      if (!retryJobId) setDrafts(previous => ({ ...previous, [id]: '' }));
    } catch (e: any) { if (current === generation.current) addToast('error', e.message); }
    finally { if (current === generation.current) setSending(false); }
  }
  async function save() {
    if (!active) return; const id = active.id; const current = generation.current; setSaving(true);
    try {
      const result = await request(currentUser.id, `/${id}`, 'PATCH', settings);
      if (current !== generation.current) return;
      setBots(previous => previous.map(b => b.id === id ? result.bot : b)); setEditing(false);
      addToast('success', 'Your bot settings are saved privately.');
    } catch (e: any) { if (current === generation.current) addToast('error', e.message); }
    finally { if (current === generation.current) setSaving(false); }
  }
  if (dataOwner !== currentUser.id) return <div className="p-8">Loading your private bots…</div>;
  return <section className="h-full min-h-0 flex flex-col bg-portal-bg text-portal-text" aria-label="Private bots">
    <header className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
      <div className="min-w-0"><h1 className="text-lg font-semibold flex items-center gap-2"><Bot size={20} className="text-brand-400" /> Private Bots</h1><p className="text-xs text-white/50 mt-1">{currentUser.name}'s personal assistants · {bots.length}/10 private workspaces</p></div>
      <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center"><button onClick={()=>setShowGoogle(!showGoogle)} className="text-xs border border-white/15 rounded-lg px-3 py-2">Google workspace</button><button onClick={()=>setShowTelegram(!showTelegram)} className="text-xs border border-white/15 rounded-lg px-3 py-2">Telegram</button><span className="text-xs text-brand-300 flex items-center gap-1 shrink-0"><ShieldCheck size={15} /> Only you</span></div>
    </header>
    {ordinaryArtifact && <div className="p-4 border-b border-white/10 text-sm"><p>This file belongs to your ordinary Echo workspace, not a private bot.</p><button className="mt-2 rounded-lg px-3 py-2 bg-brand-500" onClick={()=>downloadOutput(ordinaryArtifact,true)}>Download your Echo file</button></div>}
    {showGoogle && <div className="p-4 border-b border-white/10 text-sm space-y-3 max-h-[45vh] overflow-y-auto">
      <h2 className="font-semibold">Your Google workspace</h2>
      <p className="text-xs text-white/60">{google.prerequisite || 'Checking connection…'}</p>
      <p className="text-xs">Approved business Google accounts stay server-side. Tools can read assigned files, propose scoped original-file edits and create deliverables in approved folders. Sharing permissions and unrelated personal files remain protected. No separate staff Google login is needed for the listed business sources.</p>
      {google.connected ? <p>Connected: {google.email} <button disabled={googleBusy} className="underline ml-2" onClick={()=>googleAction('')}>Disconnect locally</button></p> : <button disabled={googleBusy||!google.configured} className="bg-brand-500 rounded-lg px-3 py-2 disabled:opacity-40" onClick={()=>googleAction('start')}>Connect my Google account</button>}
      {google.connected && <div className="flex flex-col sm:flex-row gap-2"><label className="flex-1 text-xs">Assigned Google file ID<input aria-label="Assigned Google file ID" value={googleFile} onChange={e=>setGoogleFile(e.target.value)} className="block w-full rounded-lg p-2 mt-1 bg-portal-surface border border-white/15" /></label><button disabled={googleBusy||!googleFile} onClick={()=>googleAction('target',{fileId:googleFile})} className="border border-brand-400 rounded-lg px-3 py-2">Verify and select target</button></div>}
      {google.connected && <p className="text-xs"><button disabled={googleBusy} className="underline" onClick={chooseGoogleFiles}>Choose assigned source with Google Picker</button>. Choose the source Doc or Sheet first, then open Picker again and choose its containing folder for new derived outputs.</p>}
      {(google.targets||[]).map((t:any)=><div key={t.fileId} className="text-xs break-all">Selected source: {t.fileId} <button className="underline ml-2" onClick={()=>googleAction('read',{fileId:t.fileId})}>Recheck identity and permission</button></div>)}
      <p className="text-xs text-white/60">After connection and exact-file grant, ask your bot to hand off a saved non-article output beside the selected source. It creates a new derived Doc or Sheet and checks native content. Google consent alone does not grant access to an existing file. Articles use the separate engine command below.</p>
    </div>}
    {showTelegram && <div className="p-4 border-b border-white/10 text-sm space-y-2 max-h-[45vh] overflow-y-auto">
      <h2 className="font-semibold">Connect your own Telegram account</h2><p className="text-xs text-white/50">The same ten bots, settings, jobs and history. Private chats only. This never grants general Echo or administrator access.</p>
      {telegram.binding ? <p>Linked Telegram ID: {telegram.binding.telegram_user_id} <button className="underline ml-2" onClick={()=>telegramAction('')}>Unlink</button></p> : <button className="rounded-lg px-3 py-2 bg-brand-500" onClick={()=>telegramAction('link')}>Create one-time link</button>}
      {linkCommand && <div className="rounded-lg bg-white/5 p-3 break-all"><p className="text-xs mb-2">Send this privately to the existing Echo Telegram bot within ten minutes. Keep it secret. Then return here and approve your numeric ID.</p><code className="select-all text-xs">{linkCommand}</code><button className="block underline mt-2 text-xs" onClick={()=>navigator.clipboard.writeText(linkCommand)}>Copy link command</button></div>}
      {telegram.pending && <div className="rounded-lg border border-brand-400 p-3"><p>Telegram ID requesting access: <strong>{telegram.pending.telegram_user_id}</strong></p><p className="text-xs mt-1">Approve only if this is your own Telegram ID and you just sent the command. Otherwise do not approve.</p><button className="bg-brand-500 rounded-lg px-3 py-2 mt-2" onClick={()=>telegramAction('approve',{linkId:telegram.pending.id,telegramUserId:telegram.pending.telegram_user_id})}>Approve my Telegram ID</button></div>}
      <p className="text-xs text-white/50">After linking: /bots lists your bots. /bots 1 ask &lt;task&gt; assigns work. /bots 1 history reads the result. /bots 1 name &lt;name&gt;, instructions or context changes only that bot.</p>
    </div>}
    {error && <div role="alert" className="p-3 text-sm bg-red-500/10 text-red-300">{error} <button className="underline ml-2" onClick={() => window.location.reload()}>Reload</button></div>}
    {loading ? <div className="p-8 flex gap-2"><Loader2 className="animate-spin" /> Loading your private bots…</div> : !bots.length ? <div className="p-8 text-white/60">No private bots are enabled for this account.</div> : <>
      <nav className="p-3 flex gap-2 overflow-x-auto border-b border-white/10 shrink-0" aria-label="Choose your bot">
        {bots.map(b => { const working = (jobs[b.id] || []).some(j => ['pending','running'].includes(j.status)); return <button key={b.id} onClick={() => { setActiveId(b.id); setEditing(false); }} aria-pressed={activeId === b.id} className={`shrink-0 rounded-xl border px-3 py-2 text-left min-w-[105px] ${activeId === b.id ? 'border-brand-400 bg-brand-500/15' : 'border-white/10 hover:bg-white/5'}`}>
          <span className="flex gap-2 items-center text-sm font-medium">{working ? <Loader2 size={13} className="animate-spin text-brand-400" /> : <Bot size={13} />} {b.name}</span><span className="text-[10px] text-white/40">Bot{b.slot} · {working ? 'Working' : 'Ready'}</span>
        </button>; })}
      </nav>
      {active && <>
        <div className="px-4 py-3 border-b border-white/10 flex justify-between gap-2 items-center">
          <div className="min-w-0"><h2 className="font-semibold truncate">{active.name}</h2><p className="text-xs text-white/45">Personal assistant · owned by {currentUser.name}</p></div>
          <button onClick={() => { setSettings({ name: active.name, instructions: active.instructions, context: active.context }); setEditing(!editing); }} className="flex gap-2 items-center rounded-lg border border-white/15 p-2 text-sm shrink-0"><Settings2 size={15} /> Customise</button>
        </div>
        {editing ? <div className="flex-1 min-h-0 overflow-y-auto p-4"><form onSubmit={e => { e.preventDefault(); save(); }} className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Your bot's preferences</h3><button type="button" onClick={() => setEditing(false)} aria-label="Close settings"><X size={18} /></button></div>
          <p className="text-xs text-white/50">Change your own name, persona, tone and working preferences without approval. These settings never change Echo, models, tools, permissions or another person's bots. Changes apply to new tasks.</p>
          <label className="block text-sm">Assistant name<input aria-label="Assistant name" maxLength={80} required value={settings.name} onChange={e => setSettings({ ...settings, name: e.target.value })} className="block w-full mt-2 p-3 rounded-lg bg-portal-surface border border-white/15" /></label>
          <label className="block text-sm">Persona and working instructions<textarea aria-label="Persona and working instructions" maxLength={6000} rows={5} value={settings.instructions} onChange={e => setSettings({ ...settings, instructions: e.target.value })} placeholder="For example: be concise, explain technical terms, use checklists." className="block w-full mt-2 p-3 rounded-lg bg-portal-surface border border-white/15" /></label>
          <label className="block text-sm">Private reference context<textarea aria-label="Private reference context" maxLength={24000} rows={7} value={settings.context} onChange={e => setSettings({ ...settings, context: e.target.value })} placeholder="Paste relevant reference text. Never paste passwords or credentials." className="block w-full mt-2 p-3 rounded-lg bg-portal-surface border border-white/15" /></label>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-500 rounded-lg flex gap-2 items-center disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save private settings</button>
        </form></div> : <>
          <div className="flex-1 min-h-0 overflow-y-auto p-4"><div className="max-w-3xl mx-auto space-y-5">
            {!transcript.length && <div className="py-10 text-center text-white/50"><Bot size={36} className="mx-auto mb-3 text-brand-400" /><h3 className="text-white font-semibold mb-2">A separate space for each task</h3><p className="text-sm">Assign work here, then switch bots while it runs.<br />Only this bot's saved context and conversation are used.</p></div>}
            {transcript.map(j => <article key={j.id} className="space-y-2" data-job-id={j.id}>
              <div className="ml-6 rounded-xl bg-white/5 border border-white/10 p-3"><p className="text-[10px] text-white/40 mb-1">You · {new Date(j.created_at).toLocaleString()}</p><p className="whitespace-pre-wrap break-words text-sm">{j.message}</p></div>
              <div className="mr-6 rounded-xl bg-brand-500/10 border border-brand-500/20 p-3"><p className="text-xs text-brand-300 mb-2 flex items-center gap-2"><Bot size={14} /> {active.name} · {j.status}</p>
                {!!j.tool_trace?.length&&<details className="text-xs mb-3"><summary className="cursor-pointer">{j.tool_trace.length} actual tool calls · sources and results</summary>{j.tool_trace.map((t,i)=><div key={i} className="mt-2"><strong>{t.name} · {t.success?'succeeded':'unavailable'}</strong><pre className="whitespace-pre-wrap break-words max-h-48 overflow-auto">{JSON.stringify(t.result,null,2)}</pre></div>)}</details>}
                {j.status === 'completed' ? <p className="text-sm whitespace-pre-wrap break-words"><ArtifactMessage text={j.response || ''} owner={currentUser.id}/></p> : j.status === 'failed' ? <div role="alert" className="text-sm"><p>Task failed: {j.error_code || 'PRIVATE_JOB_FAILED'}. Your request is saved.</p><button disabled={busy || sending} onClick={() => send(j.id)} className="mt-2 flex gap-1 items-center underline disabled:opacity-40"><RefreshCw size={13} /> Retry task</button></div> : <p className="text-sm flex gap-2 items-center text-white/60"><Loader2 size={14} className="animate-spin" /> {j.status === 'pending' ? 'Queued. Up to two private tasks run at once.' : 'Working on this bot’s task…'}</p>}
              </div>
            </article>)}<div ref={end} />
          </div></div>
          <form onSubmit={e => { e.preventDefault(); send(); }} className="shrink-0 p-4 border-t border-white/10"><div className="max-w-3xl mx-auto">
            <details className="mb-2 text-xs text-white/60"><summary>Read an existing article-engine handoff</summary><p className="mt-2">Use /article brightforge-clients JOB_ID or /article 10xr JOB_ID. The source workbook must be linked from your assigned task. Exact package, candidate, review and accepted handoff proof are checked before a link is returned. This does not generate prose, reopen a job or authorise publication.</p></details>
            <label className="block text-xs mb-2">{uploading?'Normalising private source…':'Upload private source (2 MiB maximum; text/cell projection)'}<input aria-label="Upload private source" type="file" accept=".txt,.md,.csv,.json,.docx,.xlsx,.pdf" disabled={uploading} onChange={e=>{const f=e.target.files?.[0];if(f)uploadFile(f);e.target.value='';}} className="block mt-1" /></label>
            {!!outputs.length&&<div className="mb-2 flex gap-2 flex-wrap text-xs">{outputs.map(o=><button type="button" key={o.id} onClick={()=>downloadOutput(o.id)} className="rounded-lg px-3 py-2 border border-brand-400">Download {o.name}{new URLSearchParams(window.location.search).get('privateArtifact')===o.id?' (Telegram link)':''}</button>)}</div>}
            <details className="mb-2 text-xs text-white/60"><summary className="cursor-pointer">Add a read-only research source</summary><div className="mt-2 flex flex-col sm:flex-row gap-2"><input type="url" aria-label="Public HTTPS page" value={publicUrls[activeId] || ''} onChange={e=>setPublicUrls({...publicUrls,[activeId]:e.target.value})} placeholder="Public HTTPS page to research" className="min-w-0 flex-1 rounded-lg p-2 bg-portal-surface border border-white/15" /><select aria-label="Your assigned Portal task" value={taskIds[activeId] || ''} onChange={e=>setTaskIds({...taskIds,[activeId]:e.target.value})} className="min-w-0 flex-1 rounded-lg p-2 bg-portal-surface border border-white/15"><option value="">No Portal task attached</option>{tasks.map(t=><option key={t.id} value={t.id}>{t.client}: {t.title}</option>)}</select></div><p className="mt-1">Public-page text and your own assigned task fields only. Private network pages, board notes and comments are excluded.</p></details>
            <div className="flex items-end gap-2"><textarea aria-label="Task for your bot" rows={3} maxLength={12000} value={drafts[activeId] || ''} onChange={e => setDrafts({ ...drafts, [activeId]: e.target.value })} placeholder={`Assign a task to ${active.name}…`} className="min-w-0 flex-1 bg-portal-surface border border-white/15 rounded-xl p-3 text-sm resize-y" /><button aria-label="Send task" type="submit" disabled={sending || busy || !drafts[activeId]?.trim()} className="bg-brand-500 rounded-xl p-3 disabled:opacity-40"><Send size={19} /></button></div><p className="text-[10px] text-white/40 mt-2">Real owner-authorised research and work tools with private downloadable outputs. Echo settings and other owners remain locked. External sends, publication and articles retain approval/engine gates.</p></div></form>
        </>}
      </>}
    </>}
  </section>;
}
