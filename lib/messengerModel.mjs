export function createMessengerTransition(){let version=0,pending=null;return{begin(){pending=++version;return version;},current(token){return token===version;},pending(){return pending!==null;},finish(token){if(pending!==token)return false;pending=null;return true;},cancel(){version++;pending=null;}};}
export function initialMessengerChannel(rows,saved,notification){return rows.find(row=>row.id===notification)||rows.find(row=>row.id===saved)||rows.find(row=>row.isTeam)||null;}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOT='00000000-0000-0000-0000-000000000001';
export function dmParticipants(channel){if(channel?.type!=='dm'||!String(channel.name).startsWith('dm_'))return [];const parts=channel.name.slice(3).split('_');return parts.length===2&&parts.every(v=>UUID.test(v)||v===BOT)?parts:[];}
/** @param {{owner:string,channels?:any[],profiles?:any[],counts?:Record<string,number>}} options */
export function buildMessengerRows({owner,channels=[],profiles=[],counts={}}){
 const people=profiles.filter(p=>p.id!==owner&&p.id!==BOT);const team=channels.find(c=>c.type!=='dm'&&c.name==='general');const own=channels.filter(c=>c.type==='dm'&&dmParticipants(c).includes(owner)&&!dmParticipants(c).includes(BOT));
 const row=c=>{const id=dmParticipants(c).find(id=>id!==owner),p=profiles.find(p=>p.id===id);return {...c,title:c===team?'Team Chat':p?.full_name||p?.email?.split('@')[0]||'Former team member',avatar:p?.avatar_url||null,online:p?.isOnline===true,personId:id||null,unread:Math.max(0,Number(counts[c.id])||0),isTeam:c===team};};
 return {conversations:[...(team?[row(team)]:[]),...own.map(row)],history:channels.filter(c=>c.type!=='dm'&&c.id!==team?.id).map(c=>({...row(c),title:c.name})),people};
}
const storage=()=>{try{return globalThis.localStorage;}catch{return undefined;}};
export function readMessengerState(owner,store=storage()){try{const s=JSON.parse(store.getItem('portalMessenger:'+owner)||'null');if(s?.owner===owner&&UUID.test(s.channelId||''))return {channelId:s.channelId,open:s.open===true,minimised:s.minimised===true};}catch{}return {channelId:'',open:false,minimised:false};}
export function saveMessengerState(owner,state,store=storage()){try{store.setItem('portalMessenger:'+owner,JSON.stringify({owner,channelId:UUID.test(state.channelId||'')?state.channelId:'',open:state.open===true,minimised:state.minimised===true}));}catch{}}
