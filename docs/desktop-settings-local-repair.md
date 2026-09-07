# Desktop/PWA Lifecycle and Settings User Management

## Scope and maturity

This is an integrated local candidate, not a deployment or an OS push-delivery certification. It repairs the internal team portal, not client portals. The candidate includes the web build, service worker, matching Electron main/preload code, server API and recipient-bound sender payload.

No production database records, credentials, user accounts, push subscriptions, team alerts, releases or remote branches were changed during this work. Browser and native tests used synthetic users on ephemeral loopback HTTP servers. No real user browser/profile was attached.

## Implemented

- Settings auth-user listing now calls `/api/admin/users`, carrying the signed-in user's bearer. The server asks GoTrue `/auth/v1/user` on every request and permits only UUIDs configured in `PORTAL_OWNER_IDS`. Editable renderer roles, `user_metadata` and `allowed_users` are not authorisation sources.
- User listing is paginated, uses the real GoTrue admin directory, and returns only the fields Settings needs. Renderer-side admin list/reset/delete calls were removed from databaseService.
- Password resets and auth-user deletion use the same server boundary. Missing/invalid authentication, non-owners, malformed targets and invalid passwords are rejected. Configured owner targets are protected, including case-altered UUIDs. The server service key is required at runtime and has no browser fallback.
- Desktop file-origin preflight is supported without credentialed cookies. Every actual request still requires an owner bearer. Same-origin web requests use the same API.
- All registration stages are bounded, including permission, worker lookup/readiness, subscribe and persistence. Cancellation invalidates pending work; late registration writes are compensated. Unresolved cleanup mutations remain quarantined so a late unsubscribe/delete cannot undo a successful retry.
- Cleanup attempts both browser unsubscribe and server row deletion and returns explicit failures instead of swallowing them.
- Auth changes, cross-tab signout, periodic remote session checks and focus revalidation clear native cards, worker binding and stale user/profile callbacks. The worker keeps only recipient ID and session expiry, never an access token.
- Service-worker pushes and clicks fail closed for missing, different or expired recipients. The sender now includes `recipientId` derived from its authorised target user ID. Deploying only the worker without its sender would suppress old unbound payloads.
- Cold-start and warm-tab links retain recipient binding; unauthenticated warm destinations wait in the hash. Different-recipient destinations are not applied. Stored navigation hints are tab-local and account-scoped; legacy origin-wide hints are removed.
- Electron now exposes notification capability through trusted main-window IPC. The UI accurately says the app must be running and signed in, OS permission is unknown, and closed-app push is unavailable. Support is not mislabelled as permission approval.

## Verification evidence

Evidence lives beside this worktree under `/home/benecho/.hermes/state/audits/portal-notifications/`.

- `desktop-repair-final-tests.log`: the standard Node suite, including new session/link tests.
- `desktop-repair-types.log`: TypeScript project check.
- `desktop-repair-build.log`: production Parcel build and public/service-worker copy.
- `desktop-repair-package.log`: Linux x64 Electron 28.3.3 packaging.
- `desktop-browser-evidence/result.json`: real isolated Chromium; Settings synthetic directory rendered through the production server handler; cross-tab signout; service-worker binding/clear; wrong-recipient warm click rejection; unauthenticated warm hash preservation; no page errors or accepted fixture writes.
- `desktop-native-evidence/result.json`: packaged Linux Electron launched on an isolated virtual display; Settings directory and real preload/main capability IPC exercised; no page errors. Screenshots show the directory and capability message.
- `desktop-independent-review.log`: initial independent review, with concrete defects converted to regressions and repaired. Final review receipt is `desktop-final-review-receipt.json`. The explicit-logout coordinator race was independently reviewed after repair; paused auth checks cannot rebind the outgoing user during cleanup. A login gate prevents entering a new account before cleanup completes.

Focused regressions include the actual Sidebar destination callback, the production sender-shaped payload passed into the worker, owner UUID case aliases, cancellation/late subscribe, and deferred cleanup operations. HTTP API tests use a synthetic upstream GoTrue server: they exercise real server routing and authorisation decisions, not a live production Supabase instance.

## Local runtime requirements

The API requires server-side `SUPABASE_INTERNAL_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and a comma-separated `PORTAL_OWNER_IDS` UUID list. The privileged key and owner list are not derived from browser input. Missing owner/key configuration fails closed. This work did not populate or change production environment variables.

Start the integrated server with `npm run portal:server` after providing that server environment and building the web assets. The Linux package honours `BRIGHTFORGE_PORTAL_URL` for the server origin. The default packaged app still points at the established portal host; it is not a standalone offline backend.

Repeat isolated browser QA with `node tests/desktopBrowserHarness.cjs`. `PLAYWRIGHT_MODULE` and `TEST_CHROMIUM` can point at installed test dependencies. The native variant uses `NATIVE_QA=1`, a loopback fixture server, the sibling Linux package directory and virtual display `:97`.

## Boundaries and remaining release gates

- No production owner login, live account reset/deletion, database migration or remote deployment was attempted. The local Settings repair is not evidence that the running production server has this API/configuration.
- GoTrue token validation is the authentication authority. Immediate revocation beyond the provider's access-token/session semantics is not independently implemented here. Worker bindings expire with the access session and are cleared on observed signout; a fully closed offline client cannot learn a remote revocation instantly.
- Physical iPhone Home Screen, Android, Windows/macOS notification delivery, OS permission approval/denial, lock-screen cards and device relaunch require separate device acceptance. The Linux native run verifies launch/UI/IPC, not OS toast delivery.
- Native notifications require the renderer to be running. This does not add a closed-app desktop push service. Retries replace matching tagged worker cards without requesting another alert; it does not promise globally exactly-once delivery across every foreground/native/worker surface.
- Existing partner-account management and broad legacy database RLS policies are outside this Settings auth-user list/reset/delete repair. They are not certified by the new owner API.
- Existing dependency metadata warnings remain: stale Browserslist/baseline mapping data, Node module-type warnings and missing package author metadata. None was counted as a passed physical-device gate.

Before release, integrate the server API, web assets, worker, matching sender contract and desktop shell together. Confirm exact production owner configuration, perform real authenticated acceptance, and publish only with Ben's approval.
