export function createCheckGate(readPending){
 let preparing=false;
 return async action=>{
  if(preparing||readPending())throw Error('Finish or review the existing check first.');
  preparing=true;
  try{return await action();}finally{preparing=false;}
 };
}
