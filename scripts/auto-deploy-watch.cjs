#!/usr/bin/env node
// Auto-deploy watcher for the portal PC.
//
// Polls GitHub for new commits on the deploy branch and, when one lands,
// pulls, reinstalls dependencies if the lockfile changed, rebuilds dist/,
// and optionally runs a restart command. Run it persistently on the machine
// that serves the portal (see AUTO_DEPLOY_SETUP.md).
//
// Environment overrides:
//   PORTAL_DEPLOY_BRANCH   branch to track            (default: main)
//   PORTAL_DEPLOY_POLL_MS  poll interval in ms        (default: 60000)
//   PORTAL_RESTART_CMD     command to run after build (default: none)

const { execSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const BRANCH = process.env.PORTAL_DEPLOY_BRANCH || 'main';
const POLL_MS = Math.max(10_000, Number(process.env.PORTAL_DEPLOY_POLL_MS) || 60_000);
const RESTART_CMD = process.env.PORTAL_RESTART_CMD || '';

const log = (msg) => console.log(`[auto-deploy ${new Date().toISOString()}] ${msg}`);

const git = (args) =>
  execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const gitSafe = (args) => {
  try {
    return git(args);
  } catch {
    return '';
  }
};

const run = (cmd) => {
  log(`$ ${cmd}`);
  execSync(cmd, { cwd: repoRoot, stdio: 'inherit' });
};

// Last commit we successfully built. Seeded with current HEAD so a restart of
// the watcher doesn't trigger a rebuild when nothing changed; failed builds
// leave this stale so the next tick retries.
let lastBuilt = git('rev-parse HEAD');
let busy = false;

const tick = () => {
  if (busy) return;
  busy = true;
  try {
    git(`fetch origin ${BRANCH}`);
    const remote = git(`rev-parse origin/${BRANCH}`);
    if (remote === lastBuilt) return;

    log(`New commit on ${BRANCH}: ${lastBuilt.slice(0, 7)} -> ${remote.slice(0, 7)}`);
    const lockBefore = gitSafe('rev-parse HEAD:package-lock.json');
    run(`git checkout ${BRANCH}`);
    run(`git pull --ff-only origin ${BRANCH}`);
    const lockAfter = gitSafe('rev-parse HEAD:package-lock.json');

    if (lockBefore !== lockAfter) {
      run('npm install --no-audit --no-fund');
    }
    run('npm run build');
    if (RESTART_CMD) run(RESTART_CMD);

    lastBuilt = remote;
    log(`Deployed ${remote.slice(0, 7)} successfully.`);
  } catch (e) {
    log(`Deploy failed (will retry next poll): ${e.message}`);
  } finally {
    busy = false;
  }
};

log(`Watching origin/${BRANCH} every ${POLL_MS / 1000}s in ${repoRoot}`);
log(`Currently built: ${lastBuilt.slice(0, 7)}${RESTART_CMD ? ` | restart cmd: ${RESTART_CMD}` : ''}`);
tick();
setInterval(tick, POLL_MS);
