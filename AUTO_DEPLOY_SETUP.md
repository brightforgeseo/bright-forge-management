# Auto-Deploy: Make the Portal Update Itself on Every Push

The live portal is served from the portal PC (via Tailscale Funnel), so
pushing to GitHub does nothing by itself — the PC has to pull and rebuild.
The watcher script in `scripts/auto-deploy-watch.cjs` automates that: it
checks GitHub every 60 seconds and, whenever a new commit lands on `main`,
it pulls, reinstalls dependencies if needed, rebuilds `dist/`, and
optionally restarts the portal server.

## One-time setup on the portal PC

In the repo folder:

```bash
npm run deploy:watch
```

Leave it running. That's it — every merge to `main` now goes live within
about a minute. If the build fails, it logs the error and retries on the
next new commit; the previous build keeps serving in the meantime.

### Options (set as environment variables before starting)

| Variable                | Default | Purpose                                  |
|-------------------------|---------|------------------------------------------|
| `PORTAL_DEPLOY_BRANCH`  | `main`  | Branch to track                           |
| `PORTAL_DEPLOY_POLL_MS` | `60000` | How often to check GitHub (ms)            |
| `PORTAL_RESTART_CMD`    | none    | Command to run after a successful build (e.g. restart the web server). Not needed if the server serves `dist/` statically. |

## Keep it running after reboots

Pick whichever fits the PC:

**Windows (Task Scheduler):**
1. Open Task Scheduler → Create Task
2. Trigger: "At log on" • Action: Start a program
3. Program: `node` • Arguments: `scripts\auto-deploy-watch.cjs` • Start in: the repo folder
4. In Settings, untick "Stop the task if it runs longer than..."

**Any OS with pm2:**
```bash
npm install -g pm2
pm2 start scripts/auto-deploy-watch.cjs --name portal-deploy
pm2 save && pm2 startup   # follow the printed instructions once
```

**macOS:** use `pm2` as above, or a LaunchAgent that runs
`node scripts/auto-deploy-watch.cjs` in the repo directory.

## Notes

- The repo on the PC must be on the `main` branch with no uncommitted
  changes, and `git pull` must work without prompting for credentials
  (use a stored token or SSH key).
- The watcher only rebuilds the web `dist/`. Desktop app releases still go
  through the existing `release:update` flow.
