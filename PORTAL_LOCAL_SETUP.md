# Run the Whole Portal Locally (Team-Accessible)

Everything runs on this one PC; the team reaches it through the existing
Tailscale Funnel URL (https://echo-ai.tailfdbc33.ts.net). The pieces:

```
team browsers / apps
        |
Tailscale Funnel (HTTPS)
        |
portal-server.cjs  (port 8080)       <- this repo, scripts/portal-server.cjs
   |- /            static portal app (dist/)
   |- /supabase/*  proxy to local Supabase, WebSockets included
   |- /api/uploads server-side file uploads into Supabase Storage
        |
local Supabase (port 54321)
```

The WebSocket proxying is what fixes "everyone shows offline" and missing
unread badges; the uploads route is what fixes image uploads.

## One-time setup (on the portal PC)

1. Make sure local Supabase is running (it already is if chat loads), and
   run these two files in the Supabase SQL editor if you haven't yet:
   - `ADD_PRESENCE_HEARTBEAT.sql`
   - `CHECK_UPLOADS_BUCKET.sql`

2. Build and start the server in the repo folder:

   ```bash
   git checkout main && git pull
   npm install
   npm run build
   npm run portal:server
   ```

3. Point the Funnel at it (replaces whatever served the portal before):

   ```bash
   tailscale funnel --bg 8080
   ```

4. Start the auto-deployer so every merge to main goes live by itself
   (see AUTO_DEPLOY_SETUP.md):

   ```bash
   npm run deploy:watch
   ```

5. Verify from any device:
   - https://echo-ai.tailfdbc33.ts.net/healthz returns `ok`
   - The portal loads, and within ~30s teammates show online
   - Pasting an image into chat uploads successfully

## Keep both processes running after reboots

```bash
npm install -g pm2
pm2 start scripts/portal-server.cjs --name portal
pm2 start scripts/auto-deploy-watch.cjs --name portal-deploy
pm2 save && pm2 startup   # follow the printed instructions once
```

(Windows alternative: two Task Scheduler entries that run
`node scripts\portal-server.cjs` and `node scripts\auto-deploy-watch.cjs`
in the repo folder at log-on.)

## Notes

- The Vercel site just redirects to the Funnel URL, so existing links keep
  working; nothing to change there.
- The desktop (Electron) app talks to Supabase on the :10000 Funnel port
  directly; leave that Funnel mapping in place if the team uses the
  desktop app.
- `scripts/portal-server.cjs` uses the stock demo service-role key for
  uploads. When you rotate the Supabase JWT secret (see
  SECURITY_ROTATE_SUPABASE_KEYS.md - strongly recommended, the demo keys
  are public knowledge), set `SUPABASE_SERVICE_ROLE_KEY` in the
  environment before starting the server.
- The server reads `dist/` from disk on every request, so a rebuild by the
  auto-deploy watcher goes live without restarting anything.
