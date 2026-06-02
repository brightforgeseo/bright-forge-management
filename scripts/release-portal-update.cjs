#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawnSync } = require('child_process');
const asar = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = require(pkgPath);
const version = pkg.version;
const productName = pkg.build?.productName || 'Bright Forge Portal';
const owner = pkg.build?.publish?.owner || 'brightforgeseo';
const repo = pkg.build?.publish?.repo || 'bright-forge-management';
const liveVersionUrl = process.env.BRIGHT_FORGE_PORTAL_VERSION_URL || 'https://echo-ai.tailfdbc33.ts.net/version';
const pm2Service = process.env.BRIGHT_FORGE_PORTAL_PM2_SERVICE || 'bright-forge-portal-web';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const allowUnpublished = args.has('--allow-unpublished');
const skipLocalInstall = args.has('--skip-local-install');
const skipWebRestart = args.has('--skip-web-restart');
const skipPublish = args.has('--skip-publish');
const skipTests = args.has('--skip-tests');
const installOnly = args.has('--install-only');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadDotEnv(path.join(os.homedir(), '.hermes', '.env'));
loadDotEnv(path.join(os.homedir(), 'AppData', 'Local', 'hermes', '.env'));
loadDotEnv(path.join(root, '.env'));

function run(command, cmdArgs, opts = {}) {
  const label = [command, ...cmdArgs].join(' ');
  if (dryRun) {
    console.log(`[dry-run] ${label}`);
    return { stdout: '', stderr: '', status: 0 };
  }
  console.log(`\n$ ${label}`);
  const result = spawnSync(command, cmdArgs, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: opts.capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
  });
  if (opts.capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.status !== 0 && !opts.allowFailure) {
    throw new Error(`Command failed (${result.status}): ${label}`);
  }
  return result;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'bright-forge-portal-release-check',
        ...(process.env.GH_TOKEN || process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}` } : {}),
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${url} returned ${res.statusCode}: ${body.slice(0, 300)}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error(`Timeout fetching ${url}`)));
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'bright-forge-portal-release-check' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) reject(new Error(`${url} returned ${res.statusCode}: ${body.slice(0, 300)}`));
        else resolve(body.trim());
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error(`Timeout fetching ${url}`)));
  });
}

function assertFile(file, description) {
  if (!fs.existsSync(file)) throw new Error(`${description} missing: ${file}`);
  const stat = fs.statSync(file);
  if (!stat.size) throw new Error(`${description} is empty: ${file}`);
  console.log(`PASS: ${description}: ${file} (${stat.size} bytes)`);
}

function findInstaller() {
  const expected = path.join(root, 'dist', `BrightForgePortal-${version}-x64-win.exe`);
  if (fs.existsSync(expected)) return expected;
  const dist = path.join(root, 'dist');
  const match = fs.readdirSync(dist).find((name) => name === `BrightForgePortal-${version}-x64-win.exe` || (name.includes(version) && name.endsWith('-win.exe')));
  return match ? path.join(dist, match) : expected;
}

function installedAsarPath() {
  if (process.platform !== 'win32') return null;
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'bright-forge-portal', 'resources', 'app.asar'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', productName, 'resources', 'app.asar'),
    path.join(process.env.PROGRAMFILES || '', productName, 'resources', 'app.asar'),
  ].filter(Boolean);
  return candidates.find(fs.existsSync) || candidates[0];
}

function verifyInstalledVersion(expectedVersion) {
  if (process.platform !== 'win32') return;
  if (dryRun) {
    console.log(`[dry-run] verify installed app.asar package.json version is ${expectedVersion}`);
    return;
  }
  const appAsar = installedAsarPath();
  assertFile(appAsar, 'installed app.asar');
  const installedPkg = JSON.parse(asar.extractFile(appAsar, 'package.json').toString('utf8'));
  if (installedPkg.version !== expectedVersion) {
    throw new Error(`Installed app version mismatch: expected ${expectedVersion}, got ${installedPkg.version}`);
  }
  console.log(`PASS: local installed app version is ${expectedVersion}`);
}

async function verifyGitHubLatest(expectedVersion, required) {
  if (dryRun) {
    console.log(`[dry-run] verify GitHub latest release is v${expectedVersion}`);
    return;
  }
  try {
    const latest = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
    const latestVersion = String(latest.tag_name || latest.name || '').replace(/^v/i, '');
    if (latestVersion !== expectedVersion) {
      throw new Error(`GitHub latest release mismatch: expected v${expectedVersion}, got ${latest.tag_name || latest.name || 'unknown'}`);
    }
    const assetNames = (latest.assets || []).map((asset) => asset.name);
    const requiredAssets = [`BrightForgePortal-${expectedVersion}-x64-win.exe`, 'latest.yml'];
    for (const asset of requiredAssets) {
      if (!assetNames.includes(asset)) throw new Error(`GitHub release v${expectedVersion} missing asset: ${asset}`);
    }
    console.log(`PASS: GitHub latest release is v${expectedVersion} and contains updater assets`);
  } catch (error) {
    if (required) throw error;
    console.warn(`WARN: GitHub latest release not verified: ${error.message}`);
  }
}

async function verifyLiveVersion(expectedVersion) {
  if (dryRun) {
    console.log(`[dry-run] verify live portal ${liveVersionUrl} returns ${expectedVersion}`);
    return;
  }
  const liveRaw = await fetchText(liveVersionUrl);
  let liveVersion = liveRaw;
  try {
    const parsed = JSON.parse(liveRaw);
    liveVersion = parsed.version || liveRaw;
  } catch (_) {}
  if (liveVersion !== expectedVersion) throw new Error(`Live portal version mismatch: expected ${expectedVersion}, got ${liveVersion}`);
  console.log(`PASS: live portal version is ${expectedVersion}`);
}

async function main() {
  const hasPublishAuth = Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
  const publishRequired = !skipPublish && !allowUnpublished;
  const publishMode = skipPublish ? 'never' : (hasPublishAuth ? 'always' : 'never');

  console.log(JSON.stringify({
    release: version,
    liveVersionUrl,
    pm2Service,
    publishMode,
    hasPublishAuth,
    dryRun,
    skipLocalInstall,
    skipWebRestart,
    allowUnpublished,
  }, null, 2));

  if (publishRequired && !hasPublishAuth) {
    const message = 'GitHub publish is required but GH_TOKEN/GITHUB_TOKEN is missing. Add the token to ~/.hermes/.env or rerun with --allow-unpublished for a local-only emergency build.';
    if (dryRun) console.warn(`DRY-RUN WARNING: ${message}`);
    else throw new Error(message);
  }

  if (!installOnly) {
    if (!skipTests) {
      run(npm, ['run', 'build']);
      run('node', ['scripts/regression-task-attachment-persistence.cjs']);
    } else {
      run(npm, ['run', 'build']);
    }

    if (!skipWebRestart) {
      run('pm2', ['restart', pm2Service, '--update-env']);
      await verifyLiveVersion(version);
    }

    run(npx, ['electron-builder', '--win', 'dir', '--x64', '--publish', 'never', '-c.win.signAndEditExecutable=false']);
    run('node', ['scripts/patch-windows-exe-icon.cjs']);
    run(npx, ['electron-builder', '--win', 'nsis', '--x64', '--prepackaged', 'dist/win-unpacked', '--publish', publishMode, '-c.win.signAndEditExecutable=false']);

    const installer = findInstaller();
    assertFile(installer, 'Windows installer');
    assertFile(path.join(root, 'dist', 'latest.yml'), 'Electron updater latest.yml');
  }

  if (!skipLocalInstall && process.platform === 'win32') {
    const installer = findInstaller();
    assertFile(installer, 'local install source installer');
    run(installer, ['/S']);
    verifyInstalledVersion(version);
  }

  await verifyGitHubLatest(version, !skipPublish && !allowUnpublished);

  console.log(`\nRelease surface complete for ${version}: live site, local install${skipPublish ? '' : ', and GitHub updater feed'}.`);
}

main().catch((error) => {
  console.error(`\nRELEASE FAILED: ${error.message}`);
  process.exit(1);
});
