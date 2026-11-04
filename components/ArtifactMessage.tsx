import React, { useEffect, useRef, useState } from 'react';
import { ArtifactRef, artifactRef, downloadArtifact, messageParts } from '../lib/artifactDelivery';
export function ArtifactButton({file,owner,label='Download file'}:{file:ArtifactRef;owner:string;label?:string}) {
  const [state,setState]=useState(''); const [busy,setBusy]=useState(false); const generation=useRef(0); const inflight=useRef(false);
  useEffect(()=>{generation.current++;inflight.current=false;setState('');setBusy(false);return()=>{generation.current++;};},[owner,file.id,file.botId]);
  async function save(){
    if(inflight.current)return;inflight.current=true;setBusy(true);const current=generation.current;
    try { const r=await downloadArtifact(file,owner,()=>current===generation.current);
      if(current===generation.current)setState(r.status==='saved'?`Saved ${r.name} (${r.bytes} bytes, SHA-256 ${r.sha256})`:r.status==='cancelled'?'Save cancelled. Original file retained.':`Download started: ${r.name}. This app version cannot confirm the file was saved.`);
    } catch(e:any){if(current===generation.current)setState(e.message || 'Download failed. Original file retained.');}
    finally{if(current===generation.current){inflight.current=false;setBusy(false);}}
  }
  return <span><button type="button" className="underline text-brand-400" disabled={busy} onClick={save}>{busy?'Downloading…':label}</button>{state&&<span role="status" className="block text-xs break-all">{state}</span>}</span>;
}
export default function ArtifactMessage({text,owner}:{text:string;owner:string}) {
  return <>{messageParts(text).map((part,i)=>{
    const file=artifactRef(part);
    if(file)return <ArtifactButton key={i} file={file} owner={owner}/>;
    // Keep ordinary URLs and all prose unchanged. No new navigation/external authority.
    return <React.Fragment key={i}>{part}</React.Fragment>;
  })}</>;
}
