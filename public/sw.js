// Bright Forge Portal — service worker for web push notifications.
// Minimal & focused: receive push events, show notifications, route clicks back into the app.

const SW_VERSION = 'bf-sw-v1';

self.addEventListener('install', (event) => {
  // Activate immediately on first install
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of any open clients without waiting for reload
  event.waitUntil(self.clients.claim());
});

// Push payload contract from the send-push edge function:
// { title: string, body: string, icon?: string, tag?: string, url?: string, linkView?: string, linkData?: object }
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // Fallback if the payload isn't JSON
    data = { title: 'Bright Forge', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Bright Forge';
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.png',
    badge: '/favicon.png',
    tag: data.tag || undefined,           // collapses repeats with the same tag
    renotify: !!data.tag,                 // still vibrate/sound on repeat tags
    requireInteraction: false,
    data: {
      url: data.url || '/',
      linkView: data.linkView || null,
      linkData: data.linkData || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// When the user clicks the notification: focus an existing tab if we have one,
// otherwise open a new one. Pass deep-link data via URL hash so the app can route on load.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (() => {
    const base = (event.notification.data && event.notification.data.url) || '/';
    const linkView = event.notification.data && event.notification.data.linkView;
    const linkData = event.notification.data && event.notification.data.linkData;
    if (!linkView) return base;
    const payload = encodeURIComponent(JSON.stringify({ linkView, linkData }));
    const sep = base.includes('#') ? '&' : '#';
    return `${base}${sep}push=${payload}`;
  })();

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Try to focus an already-open window first
    for (const client of allClients) {
      if ('focus' in client) {
        try {
          await client.focus();
          // Send a message so the app can route in-tab without a full reload
          client.postMessage({ type: 'push-click', url: targetUrl });
          return;
        } catch {}
      }
    }
    // Otherwise open a new window
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

// Allow the page to ask the SW to update on demand
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
