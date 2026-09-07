// Recipient binding is a privacy guard, not resource authorisation.
// The backend must send recipientId and authorise every linked resource.
const SW_VERSION = 'bf-sw-recipient-v2';
const STATE = 'bf-push-session-v2';
const KEY = '/__push_session__';
let serial = Promise.resolve();
const enqueue = work => { const result=serial.then(work); serial=result.catch(()=>{}); return result; };
async function binding() {
  try { const value=await (await caches.open(STATE)).match(KEY); return value ? await value.json() : null; } catch { return null; }
}
const matches = (session, recipientId) => typeof recipientId==='string' && !!recipientId && session?.recipientId===recipientId && session.expiresAt>Date.now();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  event.waitUntil(enqueue(async()=>{
    let data;try { data=event.data.json(); } catch { return; }
    if (!matches(await binding(),data.recipientId)) return;
    await self.registration.showNotification(data.title || 'Bright Forge', {
      body:data.body || '', icon:'/favicon.png', badge:'/favicon.png',
      tag:data.tag ? `${data.recipientId}:${data.tag}` : undefined,
      renotify:false, requireInteraction:false,
      data:{recipientId:data.recipientId,linkView:data.linkView || null,linkData:data.linkData || null}
    });
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(enqueue(async()=>{
    const data=event.notification.data;
    if (!matches(await binding(),data?.recipientId)) return;
    // Destinations are application view data only, never arbitrary URLs.
    const targetUrl='/#push='+encodeURIComponent(JSON.stringify({recipientId:data.recipientId,linkView:data.linkView,linkData:data.linkData}));
    for (const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})) {
      if ('focus' in client) {
        try { await client.focus();client.postMessage({type:'push-click',url:targetUrl});return; } catch {}
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  }));
});
self.addEventListener('message', event => {
  if (event.data==='skipWaiting') {self.skipWaiting();return;}
  if (event.data?.type!=='push-session') return;
  event.waitUntil(enqueue(async()=>{
    try {
      const client=event.source;
      if (!client?.url || new URL(client.url).origin!==self.location.origin) throw new Error('Invalid source');
      const cache=await caches.open(STATE);
      const previous=await binding();
      const {recipientId,expiresAt}=event.data;
      const valid=typeof recipientId==='string' && recipientId && Number.isFinite(expiresAt) && expiresAt>Date.now();
      if (!valid || previous?.recipientId!==recipientId) {
        for (const notification of await self.registration.getNotifications()) notification.close();
      }
      if (valid) await cache.put(KEY,new Response(JSON.stringify({recipientId,expiresAt})));
      else await cache.delete(KEY);
      event.ports?.[0]?.postMessage({ok:true});
    } catch {event.ports?.[0]?.postMessage({ok:false});}
  }));
});
