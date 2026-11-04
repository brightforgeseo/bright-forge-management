export const RESEARCH_GROUPS=[
 {label:'Site explorer',icon:'domain',tools:[{id:'domain-overview',label:'Overview'},{id:'competitors',label:'Organic competitors'},{id:'ranked-keywords',label:'Organic keywords'}]},
 {label:'Keywords',icon:'keywords',tools:[{id:'keywords',label:'Search volumes'},{id:'keyword-ideas',label:'Keyword ideas'},{id:'suggestions',label:'Suggestions'},{id:'related-keywords',label:'Related keywords'},{id:'keyword-difficulty',label:'Difficulty'},{id:'search-intent',label:'Search intent'}]},
 {label:'Backlinks',icon:'links',tools:[{id:'backlink-summary',label:'Overview'},{id:'backlinks',label:'Backlinks'},{id:'referring-domains',label:'Referring domains'},{id:'anchors',label:'Anchor text'},{id:'backlink-competitors',label:'Link competitors'}]},
 {label:'Live search',icon:'search',tools:[{id:'serp',label:'Google results'}]},
 {label:'AI visibility',icon:'ai',tools:[{id:'ai-visibility',label:'Prompt tracking'},{id:'ai-keywords',label:'AI search volumes'}]},
];
const ids=new Set(RESEARCH_GROUPS.flatMap(g=>g.tools.map(t=>t.id)));
const memoryRoutes=new Map();
export function validStudioNavigation(value,owner){return !!value&&value.ownerId===owner&&['research','chat'].includes(value.mode)&&ids.has(value.operation);}
export function studioRouteStorage(){try{return globalThis.sessionStorage;}catch{return undefined;}}
export function readStudioNavigation(owner,storage=studioRouteStorage()){const cached=memoryRoutes.get(owner);if(validStudioNavigation(cached,owner))return cached;try{const value=JSON.parse(storage.getItem('echoStudioNavigation:'+owner)||'null');if(validStudioNavigation(value,owner))return value;}catch{}return {ownerId:owner,mode:'research',operation:'domain-overview'};}
export function navigateStudio(owner,change,storage=studioRouteStorage(),target=globalThis.window){const value={...readStudioNavigation(owner,storage),...change,ownerId:owner};if(!validStudioNavigation(value,owner))throw Error('Invalid Studio route');memoryRoutes.set(owner,value);try{storage.setItem('echoStudioNavigation:'+owner,JSON.stringify(value));}catch{}target.dispatchEvent(new CustomEvent('echoStudioNavigation',{detail:value}));return value;}
