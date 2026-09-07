// Offline fixture QA. Never attaches to a user browser or contacts production.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,_electron}=require(process.env.PLAYWRIGHT_MODULE || '/home/benecho/.hermes/state/audits/filwest-repair/browser-tools/node_modules/playwright');
const {createUserManagementHandler}=require('../scripts/user-management-api.cjs');
const root=path.join(__dirname,'..'),native=process.env.NATIVE_QA==='1',evidence=path.resolve(root,native?'../desktop-native-evidence':'../desktop-browser-evidence');
fs.mkdirSync(evidence,{recursive:true});
const id='11111111-1111-4111-8111-111111111111';
const user={id,email:'owner@example.invalid',role:'authenticated',aud:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{full_name:'Synthetic Owner'}};
const token=[{alg:'HS256',typ:'JWT'},{sub:id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600},'fixture'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.');
let revoked=false,handler;const writes=[],requests=[];
function json(res,data,status=200){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');requests.push(url.pathname);
 if(url.pathname.startsWith('/api/admin/users')) return handler(req,res);
 if(url.pathname.endsWith('/auth/v1/user')) return json(res,revoked?{error:'revoked'}:user,revoked?401:200);
 if(url.pathname==='/auth/v1/admin/users') return json(res,{users:[user,{id:'22222222-2222-4222-8222-222222222222',email:'member@example.invalid',created_at:'2026-01-01',user_metadata:{full_name:'Synthetic Member'}}]});
 if(url.pathname.startsWith('/supabase/')) {
   if(req.method!=='GET' && req.method!=='HEAD') {writes.push({path:url.pathname,method:req.method});return json(res,{error:'Fixture writes blocked'},403);}
   let rows=[];
   if(url.pathname.endsWith('/allowed_users')) rows=[{id:1,email:user.email,full_name:'Synthetic Owner',role:'Owner'}];
   if(url.pathname.endsWith('/profiles')) rows=[{id,email:user.email,full_name:'Synthetic Owner',role:'Owner',avatar_url:null}];
   if(req.headers.accept?.includes('vnd.pgrst.object')) return json(res,rows[0] || {});
   res.setHeader('content-range',`0-${Math.max(0,rows.length-1)}/${rows.length}`);return json(res,rows);
 }
 let file=path.join(root,'dist',decodeURIComponent(url.pathname));
 if(url.pathname==='/') file=path.join(root,'dist/index.html');
 if(!file.startsWith(path.join(root,'dist')+'/') || !fs.existsSync(file)) {res.writeHead(404);return res.end();}
 const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.mjs':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json'}[path.extname(file)] || 'application/octet-stream';
 res.writeHead(200,{'content-type':type});fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 handler=createUserManagementHandler({supabaseUrl:origin,anonKey:'fixture-public',serviceKey:'fixture-private',ownerIds:[id]});
 const electronApp=native ? await _electron.launch({executablePath:path.resolve(root,'../desktop-repair-package/linux-unpacked/bright-forge-portal'),args:['--user-data-dir='+fs.mkdtempSync(require('node:os').tmpdir()+'/bf-native-qa-')],env:{...process.env,BRIGHTFORGE_PORTAL_URL:origin,DISPLAY:':97'}}) : null;
 const browser=electronApp ? {newContext:async()=>electronApp.context(),version:()=> 'Electron 28 packaged Linux',close:()=>electronApp.close()} : await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM || '/home/benecho/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'});
 try {
  const context=await browser.newContext();const blocked=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : (blocked.push(route.request().url()),route.abort()));
  await context.addInitScript(({token,user})=>{
   localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));
  },{token,user});
  const page=electronApp ? await electronApp.firstWindow() : await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Settings',exact:true}).click({timeout:20000});
  await page.getByText('member@example.invalid',{exact:true}).waitFor({timeout:15000});
  assert.equal(await page.getByText('Failed to load users',{exact:false}).count(),0);
  await page.getByText('member@example.invalid',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(evidence,'settings-owner.png'),fullPage:true});
  if(native) {
    const capability=await page.evaluate(()=>window.electronAPI.getNotificationStatus());
    assert.equal(capability.permission,'unknown');assert.equal(capability.closedAppPush,false);
    await page.getByRole('button',{name:'Enable notifications',exact:true}).click();
    await page.getByRole('status').filter({hasText:/Desktop notifications|Native notifications/}).waitFor();
    await page.screenshot({path:path.join(evidence,'native-settings-capability.png'),fullPage:true});
    assert.equal(errors.length,0,errors.join('\n'));
    fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,packagedApp:true,capability,settingsDirectory:true,errors,fixtureWritesRejected:writes},null,2));
    console.log(JSON.stringify({passed:true,native:true,evidence,capability,errors}));return;
  }
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await page.waitForFunction(async()=>{
    const response=await (await caches.open('bf-push-session-v2')).match('/__push_session__');
    return response && (await response.json()).recipientId==='11111111-1111-4111-8111-111111111111';
  });
  await page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'push-click',url:'/#push='+encodeURIComponent(JSON.stringify({recipientId:'other-user',linkView:'TASKS',linkData:{taskId:'wrong-account'}}))}})));
  assert.equal(await page.getByText('member@example.invalid',{exact:true}).count(),1);

  const sessionKey=await page.evaluate(()=>Object.keys(localStorage).find(k=>k.endsWith('-auth-token')));
  // A second real tab clears the same auth storage, exercising Supabase's storage event.
  const second=await context.newPage();await second.goto(origin,{waitUntil:'domcontentloaded'});
  await second.evaluate(key=>localStorage.removeItem(key),sessionKey);
  revoked=true;
  // Supabase v2 uses BroadcastChannel for auth changes, not arbitrary storage writes.
  await second.evaluate(()=>{const channel=new BroadcastChannel('sb-127-auth-token');channel.postMessage({event:'SIGNED_OUT',session:null});channel.close();});
  await page.getByRole('button',{name:/sign in/i}).waitFor({timeout:15000});
  await page.screenshot({path:path.join(evidence,'cross-tab-signed-out.png'),fullPage:true});
  await page.waitForFunction(async()=>!(await (await caches.open('bf-push-session-v2')).match('/__push_session__')));
  await page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'push-click',url:'/#push='+encodeURIComponent(JSON.stringify({recipientId:'11111111-1111-4111-8111-111111111111',linkView:'TASKS',linkData:{taskId:'pending-fixture'}}))}})));
  assert.ok((await page.evaluate(()=>location.hash)).includes('push='));

  assert.equal(errors.length,0,errors.join('\n'));
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,chromium:browser.version(),settingsDirectory:true,crossTabLogout:true,errors,blockedExternalRequests:blocked.length,fixtureWritesRejected:writes,requests},null,2));
  console.log(JSON.stringify({passed:true,evidence,errors,blockedExternalRequests:blocked.length,fixtureWritesRejected:writes.length}));
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
