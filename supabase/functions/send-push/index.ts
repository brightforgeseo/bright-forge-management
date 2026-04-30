// Supabase Edge Function: send-push
// Sends a Web Push notification to every push_subscription row owned by the recipient user.
// Called from a Postgres trigger on notifications INSERT (see PUSH_NOTIFICATIONS_SETUP.sql).
//
// Env vars required (set via `supabase secrets set ...`):
//   SUPABASE_URL              — already provided by the platform
//   SUPABASE_SERVICE_ROLE_KEY — already provided by the platform
//   VAPID_PUBLIC_KEY          — base64url public key (must match client)
//   VAPID_PRIVATE_KEY         — base64url private key
//   VAPID_SUBJECT             — mailto: or https URL identifying the sender

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:notifications@brightforge.app'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: 'VAPID keys not configured on the edge function' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { userId, title, body, tag, linkView, linkData, url } = await req.json()
    if (!userId || !title) {
      return new Response(
        JSON.stringify({ ok: false, error: 'userId and title are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: 'no subscriptions' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payload = JSON.stringify({
      title,
      body: body || '',
      tag: tag || undefined,
      url: url || '/',
      linkView: linkView || null,
      linkData: linkData || null,
      icon: '/favicon.png'
    })

    const results = await Promise.allSettled(subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 3600 }
        )
        return { id: s.id, ok: true }
      } catch (e: any) {
        // 404 / 410 = subscription is dead — clean it up so we don't keep retrying
        const status = e?.statusCode || e?.status || 0
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
        }
        return { id: s.id, ok: false, status, error: e?.body || e?.message || String(e) }
      }
    }))

    const sent = results.filter(r => r.status === 'fulfilled' && (r as any).value?.ok).length
    const failed = results.length - sent

    return new Response(
      JSON.stringify({ ok: true, sent, failed, total: subs.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
