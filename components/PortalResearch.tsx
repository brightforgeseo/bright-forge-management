import React,{lazy,Suspense,useEffect,useState}from'react';
import {User,ToastType}from'../types';
import {RESEARCH_GROUPS,readStudioNavigation,validStudioNavigation,navigateStudio}from'../lib/researchNavigation.mjs';
import './PortalResearch.css';
import {saveRoute}from'../lib/portalRoutes.mjs';
const ToolActivity=(React as any).Activity;
const Studio=lazy(()=>import('./ResearchStudio'));
const ids=new Set(RESEARCH_GROUPS.flatMap(g=>g.tools.map(t=>t.id)));
const hashOperation=()=>{const parts=location.hash.replace(/^#\//,'').split('/');return parts[0]==='research'&&ids.has(parts[1])?parts[1]:null;};
export default function PortalResearch({currentUser,addToast}:{currentUser:User;addToast:(type:ToastType,message:string)=>void}){
 const[operation,setOperation]=useState(()=>hashOperation()||readStudioNavigation(currentUser.id).operation),[visited,setVisited]=useState<string[]>(()=>[hashOperation()||readStudioNavigation(currentUser.id).operation]);
 const openEcho=()=>window.dispatchEvent(new CustomEvent('portalOpenEcho',{detail:{ownerId:currentUser.id}}));
 const select=(id:string)=>{if(!ids.has(id))return;navigateStudio(currentUser.id,{mode:'research',operation:id});};
 useEffect(()=>{const change=(id:string,push:boolean)=>{setOperation(id);setVisited(old=>old.includes(id)?old:[...old,id]);if(push&&location.hash.startsWith('#/research')){const url=new URL(location.href);url.hash='/research/'+id;if(url.hash!==location.hash)history.pushState({},'',url.toString());saveRoute(currentUser.id,'ECHO_WORKSPACES',{replace:true,preserveNested:true});}};const route=(event:Event)=>{const detail=(event as CustomEvent).detail;if(!validStudioNavigation(detail,currentUser.id))return;if(detail.mode==='chat'){openEcho();return;}change(detail.operation,true);};const pop=()=>{const op=hashOperation();if(op)change(op,false);};pop();window.addEventListener('echoStudioNavigation',route);window.addEventListener('popstate',pop);return()=>{window.removeEventListener('echoStudioNavigation',route);window.removeEventListener('popstate',pop);};},[currentUser.id]);
 const group=RESEARCH_GROUPS.find(g=>g.tools.some(t=>t.id===operation))||RESEARCH_GROUPS[0];
 return <div className="pp-research"><div className="pp-research-context"><nav aria-label="Research categories">{RESEARCH_GROUPS.map(g=><button key={g.label} className={g.label===group.label?'is-active':''} onClick={()=>select(g.tools[0].id)}>{g.label}</button>)}</nav><select aria-label="Research tool" value={operation} onChange={e=>select(e.target.value)}>{RESEARCH_GROUPS.map(g=><optgroup label={g.label} key={g.label}>{g.tools.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</optgroup>)}</select></div><div className="pp-research-pages">{visited.map(id=><ToolActivity key={currentUser.id+':'+id} mode={id===operation?'visible':'hidden'}><section className="pp-research-page"><Suspense fallback={<div className="cp-loading">Opening saved research...</div>}><Studio currentUser={currentUser} addToast={addToast} chat={null} researchOnly fixedOperation={id} onOpenEcho={openEcho}/></Suspense></section></ToolActivity>)}</div></div>;
}
