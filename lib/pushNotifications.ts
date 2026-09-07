// Web Push registration + subscription management.
// Designed to be safe to call repeatedly — it only ever creates ONE subscription per browser/user
// and keeps the row in `push_subscriptions` in sync.

import { supabase } from './supabaseClient';
import { WEB_PUSH_PUBLIC_KEY } from './pushPublicConfig';

// Public VAPID key must match the server. No private signing material is bundled.
const VAPID_PUBLIC_KEY: string =
  (typeof process !== 'undefined' && (process as any)?.env?.VAPID_PUBLIC_KEY) ||
  (typeof window !== 'undefined' && (window as any).VAPID_PUBLIC_KEY) ||
  WEB_PUSH_PUBLIC_KEY || '';

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
    && window.location?.protocol !== 'file:'
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

type PushResult = {ok: boolean; reason?: 'unsupported' | 'denied' | 'no-vapid' | 'subscribe-failed' | 'persist-failed' | 'permission-required' | 'cancelled' | 'timeout' | 'cleanup-failed'};
export type CleanupResult = {ok: boolean; errors: string[]};
const TIMEOUT = 8000;
let epoch = 0;
let activeUser: string | null = null;
let pending: {userId: string; promise: Promise<PushResult>} | null = null;
let cleanup: Promise<CleanupResult> | null = null;
const cancellers = new Set<() => void>();
const quarantine = new Set<Promise<unknown>>();

function bounded<T>(operation: PromiseLike<T>, generation?: number, late?: (value: T) => Promise<unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error?: Error, value?: T) => {
      if (finished) return;
      finished = true; clearTimeout(timer); cancellers.delete(cancel);
      error ? reject(error) : resolve(value as T);
    };
    const cancel = () => finish(new Error('cancelled'));
    const timer = setTimeout(() => finish(new Error('timeout')), TIMEOUT);
    if (generation !== undefined) cancellers.add(cancel);
    const work = Promise.resolve(operation).then(async value => {
      if ((finished || (generation !== undefined && generation !== epoch)) && late) await late(value);
      else finish(undefined, value);
    }, error => finish(error));
    if (late) { quarantine.add(work); void work.finally(() => quarantine.delete(work)).catch(() => {}); }
    else void work.catch(() => {});
    if (generation !== undefined && generation !== epoch) cancel();
  });
}

async function deleteSubscription(subscription: PushSubscription): Promise<CleanupResult> {
  const errors: string[] = [];
  try { if (!await bounded(subscription.unsubscribe(), undefined, async () => {})) errors.push('unsubscribe-rejected'); } catch { errors.push('unsubscribe-failed'); }
  // Attempt row deletion even if the browser unsubscribe failed. RLS still applies.
  try {
    const {error} = await bounded(supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint), undefined, async () => {});
    if (error) errors.push('server-cleanup-failed');
  } catch { errors.push('server-cleanup-failed'); }
  return {ok: !errors.length, errors};
}

export function enableWebPush(userId: string, options: {requestPermission?: boolean} = {}): Promise<PushResult> {
  if (pending?.userId === userId) return pending.promise;
  if (activeUser && activeUser !== userId) void disableWebPush();
  activeUser = userId;
  const promise = registerWebPush(userId, options, epoch, cleanup);
  pending = {userId, promise};
  void promise.finally(() => { if (pending?.promise === promise) pending = null; }).catch(() => {});
  return promise;
}

async function registerWebPush(userId: string, options: {requestPermission?: boolean}, generation: number, previousCleanup: Promise<CleanupResult> | null): Promise<PushResult> {
  if (!isPushSupported()) return {ok:false, reason:'unsupported'};
  if (!VAPID_PUBLIC_KEY) return {ok:false, reason:'no-vapid'};
  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      if (!options.requestPermission) return {ok:false, reason:'permission-required'};
      // Deliberately invoked in the gesture stack, before any asynchronous wait.
      permission = await bounded(Notification.requestPermission(), generation);
    }
    if (permission !== 'granted') return {ok:false, reason:'denied'};
    if (previousCleanup && !(await bounded(previousCleanup, generation)).ok) return {ok:false, reason:'cleanup-failed'};
    if (quarantine.size) return {ok:false, reason:'cleanup-failed'};
    const registration = await bounded(ensureServiceWorker(), generation);
    if (!registration) return {ok:false, reason:'unsupported'};
    await bounded(navigator.serviceWorker.ready, generation);
    let subscription = await bounded(registration.pushManager.getSubscription(), generation);
    if (!subscription) subscription = await bounded(registration.pushManager.subscribe({
      userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource
    }), generation, deleteSubscription);
    const current = subscription;
    const json = current.toJSON();
    const result = await bounded(supabase.from('push_subscriptions').upsert({
      user_id:userId, endpoint:json.endpoint, p256dh:json.keys?.p256dh, auth:json.keys?.auth,
      user_agent:navigator.userAgent, updated_at:new Date().toISOString()
    }, {onConflict:'endpoint'}), generation, async () => deleteSubscription(current));
    if (result.error) { await deleteSubscription(current); return {ok:false, reason:'persist-failed'}; }
    if (generation !== epoch) { await deleteSubscription(current); return {ok:false, reason:'cancelled'}; }
    await setPushSession(desiredSession.recipientId, desiredSession.expiresAt);
    return {ok:true};
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    return {ok:false, reason:reason === 'cancelled' || reason === 'timeout' ? reason : 'subscribe-failed'};
  }
}

export function disableWebPush(): Promise<CleanupResult> {
  epoch++; for (const cancel of [...cancellers]) cancel();
  pending = null; activeUser = null;
  const previous = cleanup;
  const work = (async () => {
    if (previous) await previous;
    if (!isPushSupported()) return {ok:true, errors:[]};
    try {
      const registration = await bounded(navigator.serviceWorker.getRegistration('/'));
      const subscription = await bounded(registration?.pushManager.getSubscription() || Promise.resolve(null));
      const result = subscription ? await deleteSubscription(subscription) : {ok:true, errors:[]};
      if (quarantine.size) return {ok:false, errors:[...result.errors, 'operation-still-pending']};
      return result;
    } catch { return {ok:false, errors:['cleanup-timeout-or-failure']}; }
  })();
  cleanup = work;
  void work.finally(() => { if (cleanup === work) cleanup = null; }).catch(() => {});
  return work;
}

let desiredSession: {recipientId: string | null; expiresAt: number} = {recipientId:null,expiresAt:0};
let sessionGeneration = 0;
export async function setPushSession(recipientId: string | null, expiresAt: number) {
  desiredSession = {recipientId, expiresAt};
  const mine = ++sessionGeneration;
  if (window.location?.protocol === 'file:' || !('serviceWorker' in navigator)) return;
  const registration = await bounded(navigator.serviceWorker.getRegistration('/'));
  if (mine !== sessionGeneration || !registration?.active) return;
  const channel = new MessageChannel();
  try {
    await bounded(new Promise<void>((resolve,reject) => {
      channel.port1.onmessage = event => event.data?.ok ? resolve() : reject(new Error('Worker binding failed'));
      registration.active!.postMessage({type:'push-session',...desiredSession}, [channel.port2]);
    }));
  } finally { channel.port1.close(); channel.port2.close(); }
}

/** Forward push-click messages from the SW to the app. */
export function listenForPushClicks(handler: (url: string) => void) {
  if (!('serviceWorker' in navigator)) return () => {};
  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === 'push-click' && typeof event.data.url === 'string') handler(event.data.url);
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}
