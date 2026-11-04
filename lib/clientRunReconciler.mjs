const flights=new Map();
export function reconcileTrackedRun({key,pending,isCurrent,status,request,importRun,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 const previous=flights.get(key)||Promise.resolve();
 const work=previous.catch(()=>{}).then(async()=>{
  if(!isCurrent())return null;status('Restoring check...');let run;
  try{run=(await request('/runs/'+pending.id)).run;}catch(error){if(!isCurrent())return null;if(error.status!==404)throw error;status('Starting requested check...');if(!isCurrent())return null;run=(await request('/runs',{method:'POST',body:JSON.stringify(pending.input)})).run;}
  if(!isCurrent())return null;
  while(['queued','running'].includes(run.status)){status(run.status==='running'?'Checking with provider...':'Check queued...');await sleep(1300);if(!isCurrent())return null;run=(await request('/runs/'+pending.id)).run;if(!isCurrent())return null;}
  if(!['completed','partial'].includes(run.status))throw Error(run.error||'Check '+run.status+'. No automatic paid retry was submitted.');
  if(!isCurrent())return null;status('Saving observation...');await importRun(run);if(!isCurrent())return null;return run;
 });
 flights.set(key,work);return work.finally(()=>{if(flights.get(key)===work)flights.delete(key);});
}
