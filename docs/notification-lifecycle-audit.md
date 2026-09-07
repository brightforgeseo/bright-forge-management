# Desktop/PWA and Settings lifecycle repair

Stage: integrated locally, not deployed and not physical-device delivery verified. Live alerts, production requests, deployments and database mutations: **zero**.

Base: `e9fd3240db80131d5e67bffca77eb343d224f56a`, independent `desktop-pwa-src` worktree. The original dirty repository was not edited. Parent-supplied sender-contract and review repairs in this worktree were preserved.

## Implemented and exercised

- Settings lists paginated real GoTrue auth users via `GET /api/admin/users`, not anonymous renderer admin calls or fabricated profiles. Password reset and delete use the same privileged boundary. Each call verifies the bearer with `/auth/v1/user`; the server checks the verified UUID against **server-configured owner IDs**, independently of user-editable profile/allowlist roles. Only display fields leave the API. Protected owner UUID comparisons handle valid case aliases. Password input is bounded and restricted to a password-only payload. Electron file-origin preflight is supported without cookie credentials.
- Web Push registration has bounded permission, SW registration/readiness, subscribe and persistence waits. Logout cancels the whole registration, not just readiness. Late subscribe/persist operations compensate. Pending unsubscribe/delete operations remain quarantined after timeout, blocking a registration that late cleanup could subsequently invalidate. Cleanup returns explicit errors rather than claiming success.
- The App revalidates sessions with GoTrue on startup, auth changes, focus, controller change and periodic checks. Cross-tab signout, remote verification failure and identity changes clear native cards, worker binding, deep-link state and authenticated views. Stale profile callbacks cannot reauthenticate a different account.
- SW payloads and clicks require a matching, unexpired recipient binding. Sender payloads now include the authorised `userId` as `recipientId` (parent integration repair). Missing/different-recipient payloads fail closed. SW destinations are app view data, never arbitrary URLs. Cold and warm links enforce recipient identity; unauthenticated warm clicks survive in the URL until login.
- Pending task/chat/My Work destinations use tab-local, account-scoped storage. Legacy origin-wide keys are discarded, and Sidebar persistence/dispatch uses the actual destination key.
- Electron exposes a guarded native capability query. UI states that alerts require a running, signed-in app and OS settings; it does **not** claim closed-app push or confirmed OS permission.
- Independent review additionally found a pre-existing malformed-percent URL crash in the touched server. A new red-to-green regression verifies HTTP 400 rather than an uncaught URIError.

## Server setup and integration contract

`SUPABASE_SERVICE_ROLE_KEY` and comma-separated `PORTAL_OWNER_IDS` are required in the **server environment**, never renderer build variables. An absent owner list/key returns 503. `SUPABASE_INTERNAL_URL` and `SUPABASE_ANON_KEY` identify the same GoTrue instance used by the portal. The new endpoint intentionally does not inherit the legacy demo service-key fallback.

The shipped `supabase_setup.sql` allows authenticated users to update `allowed_users`, so its role is not a safe privileged authority. Server owner IDs deliberately provide a separate trust root. Existing unrelated allowlist/partner-management RLS and functions are not comprehensively redesigned by this repair. `updateUserRole` is not an authority source for this API.

GoTrue validates token expiry and user validity. Standard Supabase access JWTs can remain valid until expiry after refresh-session revocation. This change does not claim instant server revocation of every previously issued JWT, nor does it read `auth.sessions` directly. The SW's cached recipient binding expires with the verified access session and needs an app session refresh after expiry.

Ship sender, web build and `public/sw.js` together. Package matching Electron main/preload; a web deployment does not upgrade an installed shell. The parent backend notification-route lane remains a separate integration responsibility.

## Verification receipts

- `npm test`: **64 passed, 0 failed, 0 skipped**. Includes synthetic HTTP API tests, production SW/Card/registration logic, cancellation and timeout regressions, recipient/storage/session tests, and parent sender-to-worker regressions.
- `npm run build`: exit 0. Existing Browserslist/baseline mapping age warnings remain.
- `git diff --check`: exit 0.
- `node tests/desktopBrowserHarness.cjs`: pass in standalone headless Chromium 1234, using an isolated Playwright context and local fixtures. Real App Settings displays both synthetic users through the real server API handler. Actual SW CacheStorage binding clears on cross-tab signout; wrong-recipient warm navigation is rejected; unauthenticated warm links remain pending. No page errors, external requests, or fixture writes. No browser notification permission was overridden or approved.
- `electron-builder --linux dir --publish never --config.directories.output=../desktop-linux-package`: exit 0, Electron 28.3.3 x64 unpacked package. ASAR extraction byte-matches current `electron.js`, `preload.js`, `dist/sw.js`.
- Independent review: `../desktop-independent-review.log` found four issues; all repaired with regressions. `../desktop-independent-rereview.log` verified those repairs and found only the malformed-path baseline issue, subsequently repaired and tested. It did not rerun browser/device QA.

Evidence lives beside this worktree: `desktop-repair-final-tests.log`, `desktop-repair-build.log`, `desktop-repair-browser.log`, `desktop-linux-package.log`, `desktop-browser-evidence/{result.json,settings-owner.png,cross-tab-signed-out.png}`. The directory screenshot was inspected: both synthetic users and reset/delete controls render cleanly.

## Honest remaining platform gates

No release, migration or deployment was performed. Windows/macOS/Linux OS-card permission/Do Not Disturb behaviour, actual background delivery, mobile lock/relaunch, and iPhone Home Screen delivery still require device acceptance. The Linux package was assembled and its contents verified, not launched against team data. The tests prove the repaired local behaviour, not universal exactly-once delivery or all-platform closed-app push.
