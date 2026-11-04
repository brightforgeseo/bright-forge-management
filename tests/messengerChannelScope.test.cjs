const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('channel metadata cannot cross signed-in accounts through the shared cache',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../services/databaseService.ts'),'utf8');const body=source.match(/export const fetchChannels = async \(\): Promise<ChatChannel\[\]> => \{([\s\S]*?)\n\};/)[1].replace(/ as ChatChannel\[\]/g,'').replace(/channelsCache!/g,'channelsCache');let actor='owner-a';
 const supabase={auth:{getUser:async token=>({data:{user:{id:token||actor}}}),getSession:async()=>({data:{session:{access_token:actor}}})},from:table=>{let token;const builder={select(){return this;},order(){return this;},eq(){return this;},setHeader(name,value){token=value.replace('Bearer ','');return this;},then(resolve){resolve({data:table==='channels'?[{id:token||actor,name:'private-'+(token||actor),is_private:false}]:[],error:null});}};return builder;}};
 const run=new Function('supabase',`let channelsCache=null,channelsCacheToken=null;const cloneCachedValue=v=>structuredClone(v),isCacheFresh=v=>!!v?.value&&v.expiresAt>Date.now();return async()=>{${body}}`)(supabase);
 assert.equal((await run())[0].id,'owner-a');actor='member-b';assert.equal((await run())[0].id,'member-b');
});
