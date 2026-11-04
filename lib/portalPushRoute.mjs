export const hasPendingPush=hash=>String(hash||'').startsWith('#push=');
export function consumeColdPush({hash,owner,canAccess,clear,apply,fallback}){
 if(!hasPendingPush(hash))return false;
 let payload;
 try{payload=JSON.parse(decodeURIComponent(hash.slice(6)));}catch{clear();fallback();return true;}
 clear();
 if(payload?.recipientId===owner&&typeof payload.linkView==='string'&&canAccess(payload.linkView))apply(payload.linkView,payload.linkData);
 else fallback();
 return true;
}
