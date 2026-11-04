// A late response must not regress a run already observed as terminal.
export function mergeResearchRun(current,incoming){
 if(!current||!incoming||current.id!==incoming.id)return incoming;
 const terminal=run=>['completed','partial','failed','uncertain','interrupted'].includes(run.status);
 if((current.revision||0)>(incoming.revision||0))return current;
 if(terminal(current)&&!terminal(incoming))return current;
 if(current.status==='running'&&incoming.status==='queued')return current;
 return incoming;
}
