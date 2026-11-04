import React,{lazy,Suspense,useState,useEffect}from'react';
import {ToastType,User}from'../types';
const OrdinaryEcho=lazy(()=>import('./EchoWorkspaces'));
const PrivateBots=lazy(()=>import('./PrivateBots'));
const ResearchStudio=lazy(()=>import('./ResearchStudio'));
interface Props{currentUser:User;addToast:(type:ToastType,message:string)=>void;}
export function EchoConversations({currentUser,addToast}:Props){
 const [view,setView]=useState<'ordinary'|'private'>(()=>['privateBot','ordinaryArtifact','privateGoogleCallback'].some(key=>new URLSearchParams(window.location.search).has(key))?'private':'ordinary');
 useEffect(()=>{const handler=(event:Event)=>{if((event as CustomEvent).detail?.ownerId===currentUser.id)setView('ordinary');};window.addEventListener('echoResearchDraft',handler);return()=>window.removeEventListener('echoResearchDraft',handler);},[currentUser.id]);
 return <div className="flex flex-col h-full min-h-0 bg-portal-bg"><nav aria-label="Echo workspace type" className="flex shrink-0 gap-2 px-4 py-2 border-b border-white/10"><button type="button" aria-pressed={view==='ordinary'} onClick={()=>setView('ordinary')} className={`px-3 py-1.5 rounded-lg text-sm ${view==='ordinary'?'bg-brand-500/20 text-brand-300':'text-white/60 hover:bg-white/5'}`}>Echo conversations</button><button type="button" aria-pressed={view==='private'} onClick={()=>setView('private')} className={`px-3 py-1.5 rounded-lg text-sm ${view==='private'?'bg-brand-500/20 text-brand-300':'text-white/60 hover:bg-white/5'}`}>Private Bots</button></nav><div className="flex-1 min-h-0"><Suspense fallback={<div role="status" className="p-4 text-sm text-white/60">Loading conversations...</div>}>{view==='ordinary'?<OrdinaryEcho key={currentUser.id} currentUser={currentUser} addToast={addToast}/>:<PrivateBots key={currentUser.id} currentUser={currentUser} addToast={addToast}/>}</Suspense></div></div>;
}
export default function EchoHub(props:Props){return <Suspense fallback={<div role="status" className="p-6">Loading Echo Studio...</div>}><ResearchStudio key={props.currentUser.id} currentUser={props.currentUser} addToast={props.addToast} chat={<EchoConversations key={props.currentUser.id} {...props}/>}/></Suspense>;}
