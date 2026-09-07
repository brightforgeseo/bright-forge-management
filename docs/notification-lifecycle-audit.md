# Desktop and PWA notification audit

Stage: implemented locally, not deployed or device-delivery verified. Live writes and alerts: zero.

Base: origin/main at 2c2a0f3 (version 1.0.322), fetched before creating independent branch `audit/desktop-pwa-notification-lifecycle`. The original dirty repository was not edited. No schema/migration or sender changes.

## Repairs with observed red -> green regressions

- Concurrent Web Push enable calls for the same user now share the pending operation, avoiding duplicate subscribe/save calls. Completed failures remain retryable.
- Explicit logout cancels a pending registration, including a worker-readiness wait, unsubscribes and attempts row removal while still authenticated, before calling signOut.
- Switching users cancels the previous registration and serialises cleanup before the new user's registration. Permission remains invoked directly from the user gesture, before awaits.
- Electron notification destinations now travel Sidebar -> preload -> main-process card -> preload -> App. The App rejects native destinations for a different recipient or unauthenticated session.
- Explicit logout closes tracked Electron cards and invalidates their stale callbacks. IPC writes are limited to the main window webContents sender.
- Cold-start PWA destination hashes remain intact until authentication completes.
- Service-worker click URLs are constrained to the portal origin, including malformed/external URL fallback.
- Repeated tagged pushes replace the card without `renotify`, rather than requesting another vibration/sound.

## Verification

`npm test`: 36 passed, 0 failed, 0 skipped. Existing Node MODULE_TYPELESS_PACKAGE_JSON warnings remain.

`npm run build`: exit 0. `git diff --check`: exit 0.

Focused fixture tests execute the production registration module, service-worker handlers, Electron card/preload code and extracted App callbacks. All use synthetic recipients and fake browser/OS/database interfaces. They are not delivery tests or full authenticated UI tests.

Evidence outside git, beside this worktree: `desktop-final-tests.log`, `desktop-build.log`, `desktop-baseline.log`, `desktop-electron-red.log`, `desktop-logout-red.log`. Earlier red failures are also in the agent execution transcript.

The isolated static build returned HTTP 200. Browser UI testing could not connect: the browser harness requires the user to approve Chrome remote debugging. No repeated connection was attempted. The temporary static server was stopped. No conflicting Electron process was launched.

## Unresolved acceptance gates / findings

1. **Settings: Failed to load users:** `services/databaseService.ts:fetchAllAuthUsers` invokes `supabaseAdmin.auth.admin.listUsers()`, but `lib/supabaseClient.ts` deliberately binds that client to the anon key with no persisted session. This cannot perform GoTrue admin listing. Restore functionality via an authenticated server-side owner-authorised, paginated user-management API. Do NOT restore a service-role key in the renderer or fabricate auth-user data from profiles. Reset/delete/admin functions in the same service also need this privileged boundary. Left to the independent backend security lane; no frontend masking or schema change made.
2. **Web Push account isolation is not complete across all paths.** Explicit app logout and in-process enable account switches are covered. Expired/revoked auth, logout in another tab, already-displayed SW cards, old unscoped deep-link storage keys and incoming payload recipient binding still require an end-to-end session design. `disableWebPush` still logs and swallows unsubscribe/delete failures; successful signOut does not prove successful server cleanup.
3. **Remaining asynchronous failure gates:** cancellation while permission, service-worker registration, subscribe or persistence is stalled is not bounded by a timeout. Worker-readiness cancellation is covered. Native cards are cleared on explicit logout, not all possible auth-state changes.
4. **Desktop background limitations:** Electron notifications depend on the renderer's realtime/polling session. This is not an OS-level closed-app push implementation. NotificationSetup still reports unsupported Web Push in file-based Electron; it does not expose an OS-notification capability/status interface.
5. **Retry boundary:** same-ID Sidebar realtime/poll duplicates already deduplicate during a mount. Cross-mount and foreground browser-toast vs SW push duplicate coordination is not complete. `renotify:false` does not prove exactly-once delivery after a dismissed card or on iOS.
6. **Warm PWA clicks:** recipient binding is absent from the current SW payload contract, and unauthenticated warm-tab click handling is not repaired here. Full authorisation remains a backend requirement, not a deep-link property.
7. **Core acceptance:** existing automated suite and production build pass. Real Settings/boards/chat/upload workflows, desktop OS permission denial/approval, Windows/macOS/Linux cards, device lock/background/relaunch and iPhone Home Screen delivery remain unverified. Physical iOS device unavailable. No real team data or session was used.

## Integration

Cherry-pick this branch's commit into a CLEAN integration worktree, not the original dirty working copy. It touches App.tsx, Sidebar.tsx, electron.js/preload.js/electron.d.ts, lib/pushNotifications.ts, public/sw.js and new tests. Reconcile overlap with parallel native-mobile registration work, especially App logout, without removing either platform's cleanup.

Run `npm test`, `npm run build`, and `git diff --check`. Ship the web build and copied `public/sw.js` together; package Electron with its matching preload and main-process files. A web-only deploy does not update the installed desktop shell. Run isolated browser/device acceptance before publishing. No push/release/deploy was performed by this audit.
