# Web Push Notifications — One-Time Setup

Push notifications fire even when the app is **closed**. This requires three things to be set up once: VAPID keys, the edge function, and a Postgres trigger.

## 1) Generate VAPID keys

Run locally (Node ≥18):

```bash
npx web-push generate-vapid-keys
```

You'll get something like:

```
Public Key:  BJxxxx...        ← used by client + edge function
Private Key: yxxxx...         ← used by edge function ONLY (keep secret)
```

## 2) Set the client public key

Add to your Vercel env vars (and `.env.local` for dev):

```
VAPID_PUBLIC_KEY=BJxxxx...
```

This gets inlined into the bundle at build time.

## 3) Deploy the edge function

```bash
cd supabase/functions/send-push
supabase functions deploy send-push --no-verify-jwt
```

Set its secrets:

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=BJxxxx... \
  VAPID_PRIVATE_KEY=yxxxx... \
  VAPID_SUBJECT=mailto:notifications@brightforge.app
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-provided by the platform — don't set them yourself.

## 4) Run the SQL migration

In the Supabase SQL editor, paste & run **`PUSH_NOTIFICATIONS_SETUP.sql`** (in repo root).

Then **edit and run** these two ALTER DATABASE statements with your real values:

```sql
ALTER DATABASE postgres SET app.settings.send_push_url
  = 'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/send-push';
ALTER DATABASE postgres SET app.settings.service_role_key
  = '<YOUR-SUPABASE-SERVICE-ROLE-KEY>';
```

(The service role key is in Supabase → Settings → API → `service_role` secret.)

After this, every row inserted into `notifications` will fire a push to all that user's registered devices.

## 5) Verify

1. Reload the deployed app, log in, and accept the browser permission prompt.
2. Check `push_subscriptions` in the DB — there should be a row for your user.
3. Have a teammate trigger a notification (assign you a task, send a chat). You should get a desktop/mobile push **even with the tab closed**.

## Troubleshooting

- **No row in `push_subscriptions`** → check browser console; usually means `VAPID_PUBLIC_KEY` wasn't set at build time.
- **Row exists but no push arrives** → check edge function logs (`supabase functions logs send-push`). Usually wrong VAPID private key or `app.settings.send_push_url` not configured.
- **Used to work, stopped working for one user** → their browser revoked the subscription. Trigger goes 410 → row gets auto-deleted next attempt → user re-subscribes on next login.
- **iOS Safari** → web push needs iOS 16.4+ AND the user must have added the site to the home screen first.
