# URGENT: Rotate the self-hosted Supabase JWT secret

## Why this matters

The portal currently authenticates to the self-hosted Supabase instance with the
**default `supabase-demo` anon key**. That key is signed with the publicly
documented demo JWT secret that ships with every Supabase self-hosting guide.

Because the instance is exposed to the public internet through the Tailscale
Funnel (`echo-ai.tailfdbc33.ts.net:10000`), **anyone** who knows that default
secret (it's in Supabase's public docs and GitHub) can sign their own
`service_role` token and gain full admin read/write access to the entire
database — clients, chats, tasks, partner accounts, everything. No password
needed.

## How to fix it (on the server that runs Supabase)

1. **Generate a new JWT secret** (40+ random characters):
   ```bash
   openssl rand -base64 48
   ```

2. **Update the Supabase docker `.env`** (usually `supabase/docker/.env`):
   - Set `JWT_SECRET` to the new value.
   - Regenerate `ANON_KEY` and `SERVICE_ROLE_KEY` signed with the new secret.
     Supabase provides a generator: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
     (or use any JWT tool: payload `{"role":"anon","iss":"supabase","exp":<far future>}` /
     `{"role":"service_role","iss":"supabase","exp":<far future>}`, HS256, signed with the new secret).

3. **Restart the stack**:
   ```bash
   docker compose down && docker compose up -d
   ```

4. **Rebuild the portal with the new anon key** so the frontend uses it:
   ```bash
   SUPABASE_ANON_KEY="<new anon key>" npm run build
   ```
   Parcel inlines `process.env.SUPABASE_ANON_KEY` at build time
   (see `lib/supabaseClient.ts`). For local dev, put it in a `.env` file.
   Do the same for the desktop (`npm run electron:build`) and mobile
   (`npm run mobile:build`) builds.

5. **Update any backend services / edge functions** that use the old
   `SERVICE_ROLE_KEY`.

Note: rotating the JWT secret invalidates existing user sessions — everyone
just logs in again. User passwords are stored hashed by GoTrue and are not
affected.

## Also worth doing

- Keep `service_role` keys strictly server-side. The frontend's
  `supabaseAdmin` export is already bound to the anon key (good) — never
  change it back to a service-role key.
- Review Row Level Security policies: with the funnel public, RLS is the only
  thing standing between the internet and your data even after rotation.
