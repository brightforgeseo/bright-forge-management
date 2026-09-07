const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function native() {
 const sent=[],cards=[];
 class Notification {static isSupported(){return true;} constructor(){this.events={};cards.push(this);} on(k,fn){this.events[k]=fn;}show(){}close(){this.closed=true;}}
 const source=fs.readFileSync(require('node:path').join(__dirname,'../electron.js'),'utf8');
 const code=source.slice(source.indexOf('// Helper function to show native OS notification'),source.indexOf('// Determine if we are in development mode'));
 const context={Notification,console:{log(){},error(){},warn(){}},require:()=>({existsSync:()=>false}),appIconPath:'fixture',mainWindow:{isMinimized:()=>false,focus(){},webContents:{send:(...args)=>sent.push(args)}},process:{platform:'linux'}};
 vm.createContext(context);vm.runInContext(code,context);
 return {sent,cards,show:context.showNativeNotification,context};
}
test('native card click forwards its destination and recipient',()=>{
 const n=native(); const route={id:'fixture-1',userId:'alice',linkView:'TASKS',linkData:{taskId:'fixture-task'}};
 n.show('Fixture','Fixture',route);n.cards[0].events.click();
 assert.equal(n.sent[0]?.[0],'notification-click');
 assert.deepEqual(n.sent[0]?.[1],route);
});
test('preload bridges destination and removes its click listener',()=>{
 let api; const sent=[],listeners=new Map();
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../preload.js'),'utf8'),{console:{log(){}},require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>api=value},ipcRenderer:{send:(...args)=>sent.push(args),on:(name,fn)=>listeners.set(name,fn),removeListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}}})});
 const route={userId:'alice',linkView:'TASKS'};
 api.showNotification('Fixture','Fixture',route);
 assert.deepEqual(sent[0][1].destination,route);
 let received; assert.equal(typeof api.onNotificationClick,'function');
 const off=api.onNotificationClick(data=>received=data);
 listeners.get('notification-click')({},route);assert.equal(received,route);
 off();assert.equal(listeners.size,0);
 assert.equal(typeof api.getNotificationStatus,'function');
 assert.equal(typeof api.clearNotifications,'function');
 api.clearNotifications();assert.equal(sent[1][0],'clear-notifications');
});
test('native renderer wiring carries the recipient and rejects other accounts',()=>{
 const app=fs.readFileSync(require('node:path').join(__dirname,'../App.tsx'),'utf8');
 const sidebar=fs.readFileSync(require('node:path').join(__dirname,'../components/Sidebar.tsx'),'utf8');
 assert.match(sidebar,/showNotification\(note.title, note.message, note\)/);
 const effect=app.match(/return window\.electronAPI\?\.onNotificationClick\(\(destination\) => \{([\s\S]*?)\n    \}\);/);
 assert.ok(effect,'native click listener must be mounted');
 const routed=[];
 const fn=vm.runInNewContext('(destination)=>{'+effect[1]+'}',{isAuthenticated:true,currentUser:{id:'alice'},applyPushDeepLink:(...args)=>routed.push(args)});
 fn({userId:'bob',linkView:'TASKS',linkData:{taskId:'wrong'}});
 fn({userId:'alice',linkView:'TASKS',linkData:{taskId:'right'}});
 assert.equal(routed.length,1);assert.equal(routed[0][1].taskId,'right');
});
test('clearing native cards closes them and disables stale click callbacks',()=>{
 const n=native();n.show('Fixture','Fixture',{userId:'alice'});
 assert.equal(typeof n.context.clearNativeNotifications,'function');
 n.context.clearNativeNotifications();n.cards[0].events.click();
 assert.equal(n.cards[0].closed,true);assert.equal(n.sent.length,0);
});
module.exports={native};
