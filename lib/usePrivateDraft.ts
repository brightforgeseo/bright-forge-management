import {useEffect,useMemo,useSyncExternalStore}from'react';
import {createDraftController}from'./savedDraft.mjs';
import {clientSeoRequest}from'./clientSeoClient';
const retainedChatControllers=new Map<string,{owner:string;controller:any}>();
export function usePrivateDraft(owner:string,surface:string,initial:any,retain=false){
 const controller=useMemo(()=>{const key=owner+':'+surface;if(retain&&retainedChatControllers.has(key))return retainedChatControllers.get(key)!.controller;const value=createDraftController({initial,request:(method:string,body?:any)=>clientSeoRequest(owner,'/drafts/'+encodeURIComponent(surface),{method,body:body?JSON.stringify(body):undefined})});if(retain)retainedChatControllers.set(key,{owner,controller:value});return value;},[owner,surface,retain]);
 const snapshot:any=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
 useEffect(()=>{void controller.load();return()=>controller.dispose();},[controller]);
 useEffect(()=>{const flush=()=>{void controller.flush();};const before=(event:BeforeUnloadEvent)=>{const dirty=controller.getSnapshot().dirty||[...retainedChatControllers.values()].some(entry=>entry.owner===owner&&entry.controller.getSnapshot().dirty);if(dirty){flush();event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',before);window.addEventListener('pagehide',flush);return()=>{window.removeEventListener('beforeunload',before);window.removeEventListener('pagehide',flush);};},[controller]);
 return {...snapshot,set:controller.update,flush:controller.flush,reload:controller.load,current:controller.getSnapshot};
}
