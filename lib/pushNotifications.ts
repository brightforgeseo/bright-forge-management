// Web Push registration + subscription management.
// Designed to be safe to call repeatedly — it only ever creates ONE subscription per browser/user
// and keeps the row in `push_subscriptions` in sync.

import { supabase } from './supabaseClient';

// VAPID public key. Replace via env var in production. The literal fallback is harmless —
// it's an example key that will fail to send, surfacing the misconfiguration loudly.
const VAPID_PUBLIC_KEY: string =
  (typeof process !== 'undefined' && (process as any)?.env?.VAPID_PUBLIC_KEY) ||
  (typeof window !== 'undefined' && (window as any).VAPID_PUBLIC_KEY) ||
  '';

// Convert a base64url VAPID key into the Uint8Array PushManager.subscribe expects.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) return existing;
    // Parcel rejects literal-string register() calls. Build the path dynamically
    // so static analysis can't latch onto it — the SW lives at /sw.js (copied
    // into dist/ via the build script).
    const swPath = ['/', 'sw.js'].join('');
    return await navigator.serviceWorker.register(swPath, { scope: '/' });
  } catch (e) {
    console.error('[Push] Service worker registration failed:', e);
    return null;
  }
}

async function persistSubscription(userId: string, subscription: PushSubscription) {
  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });
  if (error) console.error('[Push] Failed to persist subscription:', error);
}

/**
 * Register the SW, request permission if needed, subscribe via PushManager, and persist
 * the subscription server-side. Safe to call on every login / Sidebar mount.
 */
export async function enableWebPush(userId: string): Promise<{
  ok: boolean;
  reason?: 'unsupported' | 'denied' | 'no-vapid' | 'subscribe-failed';
}> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Push] VAPID_PUBLIC_KEY is not configured — skipping web push subscribe.');
    return { ok: false, reason: 'no-vapid' };
  }

  // Permission gate
  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }
  if (perm !== 'granted') return { ok: false, reason: 'denied' };

  const registration = await ensureServiceWorker();
  if (!registration) return { ok: false, reason: 'unsupported' };

  // Wait until the SW is active before trying to subscribe
  await navigator.serviceWorker.ready;

  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await persistSubscription(userId, existing);
      return { ok: true };
    }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: lib.dom typings vary on whether this accepts Uint8Array directly
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource
    });
    await persistSubscription(userId, subscription);
    return { ok: true };
  } catch (e) {
    console.error('[Push] subscribe failed:', e);
    return { ok: false, reason: 'subscribe-failed' };
  }
}

/** Unsubscribe (e.g. on logout) and clean up the server row. */
export async function disableWebPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      if (endpoint) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
  } catch (e) {
    console.error('[Push] disableWebPush failed:', e);
  }
}

/** Forward push-click messages from the SW to the app so deep links route in-tab. */
export function listenForPushClicks(handler: (url: string) => void) {
  if (!('serviceWorker' in navigator)) return () => {};
  const onMessage = (event: MessageEvent) => {
    if (event.data && event.data.type === 'push-click' && typeof event.data.url === 'string') {
      handler(event.data.url);
    }
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}
