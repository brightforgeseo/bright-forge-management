export function createProjectWriter({read,baseline,submit,receipt}){
 let inflight=null;
 return ()=>{
  if(inflight)return inflight;
  inflight=(async()=>{let result=baseline();while(true){const state=read();if(!state.ready)throw Error('Wait for saved settings to load');if(!state.value.projectDirty&&result)return result;const fields=structuredClone(state.value.fields);result=await submit(fields,state.value.projectRevision||0);await receipt(result,fields);if(!read().value.projectDirty)return result;}})().finally(()=>{inflight=null;});
  return inflight;
 };
}
