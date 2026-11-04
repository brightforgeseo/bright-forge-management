const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('components/TaskBoard.tsx','utf8');
const start=source.indexOf('    const loadData = async () => {');
const end=source.indexOf('    loadData();',start);
test('Project Tasks releases loading and records error on failed board fetch, then recovers',async()=>{
 let loading=false,error=null,fail=true,clients=[];
 const context={pendingSaveRef:{current:null},selectedClientIdRef:{current:''},currentUser:{id:'fixture'},localStorage:{getItem:()=>null,removeItem(){}},Promise,console:{error(){}},setIsLoadingData:v=>loading=v,setLoadError:v=>error=v,fetchClientBoards:async()=>{if(fail)throw new Error('offline');return [{id:'recovered'}]},fetchProfiles:async()=>[],setClients:v=>clients=v,clientsRef:{current:[]},selectClient(){},setTeamProfiles(){}};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+';globalThis.load=loadData;',context);
 await context.load().catch(()=>{});
 assert.equal(loading,false,'loading spinner must settle');assert.ok(error,'failed load must be shown');
 fail=false;await context.load();assert.equal(error,null);assert.equal(clients[0].id,'recovered');
});
