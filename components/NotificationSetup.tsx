import React, {useEffect, useState} from 'react';
import {Bell} from 'lucide-react';
import {enableWebPush} from '../lib/pushNotifications';

type Result = Awaited<ReturnType<typeof enableWebPush>>;
const messages: Record<string, string> = {
  unsupported: 'Background alerts are unavailable here. On iPhone, use the Home Screen app on iOS 16.4 or later. Android app push requires native setup.',
  denied: 'Notifications are blocked. Change this app or website permission in your device settings, then retry.',
  'no-vapid': 'Push delivery is not configured on the server. In-app notifications remain available.',
  'subscribe-failed': 'This device could not register for background alerts. Please retry.',
  'persist-failed': 'Device registration could not be saved. Background alerts are not enabled.',
  'permission-required': 'Tap Enable notifications to allow background alerts on this device.'
};

export default function NotificationSetup({userId, collapsed=false}: {userId:string; collapsed?:boolean}) {
  const [result,setResult]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false);
  const [open,setOpen]=useState(false);
  useEffect(()=>{
    let active=true;
    setResult(null);
    if(userId && userId!=='guest') enableWebPush(userId).then(r=>{if(active)setResult(r);}).catch(()=>{if(active)setResult({ok:false,reason:'subscribe-failed'});});
    return ()=>{active=false;};
  },[userId]);
  if(!userId || userId==='guest') return null;
  const enable=()=>{
    setOpen(true);setBusy(true);
    // Invoke from the click itself, before any await, as required by iOS.
    enableWebPush(userId,{requestPermission:true}).then(setResult).catch(()=>setResult({ok:false,reason:'subscribe-failed'})).finally(()=>setBusy(false));
  };
  const status=result?.ok ? 'Device subscription saved. Delivery still depends on the server and device settings.' : result ? messages[result.reason || 'subscribe-failed'] : 'Checking notification support…';
  return <div className="mb-2">
    <button type="button" onClick={enable} disabled={busy} title="Enable notifications" aria-label="Enable notifications" className="flex items-center gap-2 w-full min-h-[44px] px-2 rounded-lg text-white/80 hover:bg-white/10 disabled:opacity-50">
      <Bell className="w-4 h-4 shrink-0"/>{!collapsed && <span className="text-xs">{busy?'Checking…':'Enable notifications'}</span>}
    </button>
    {open && <p role="status" className="text-xs leading-relaxed px-2 pb-2 text-white/70">{status}</p>}
  </div>;
}
