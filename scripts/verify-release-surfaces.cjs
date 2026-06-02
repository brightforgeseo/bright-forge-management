#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawnSync } = require('child_process');
const asar = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;
const owner = pkg.build?.publish?.owner || 'brightforgeseo';
const repo = pkg.build?.publish?.repo || 'bright-forge-management';
const liveVersionUrl = process.env.BRIGHT_FORGE_PORTAL_VERSION_URL || 'https://echo-ai.tailfdbc33.ts.net/version';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  }
}
loadDotEnv(path.join(os.homedir(), '.hermes', '.env'));
loadDotEnv(path.join(os.homedir(), 'AppData', 'Local', 'hermes', '.env'));
loadDotEnv(path.join(root, '.env'));

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'bright-forge-portal-release-check' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => res.statusCode >= 200 && res.statusCode < 300 ? resolve(body.trim()) : reject(new Error(`${url} returned ${res.statusCode}: ${body.slice(0, 300)}`)));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error(`Timeout fetching ${url}`)));
  });
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
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`${url} returned ${res.statusCode}: ${body.slice(0, 300)}`));
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error(`Timeout fetching ${url}`)));
  });
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'pipe', shell: false });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').slice(0, 500)}`);
  return result.stdout;
}

function assertFile(file, description) {
  if (!fs.existsSync(file)) throw new Error(`${description} missing: ${file}`);
  const size = fs.statSync(file).size;
  if (!size) throw new Error(`${description} empty: ${file}`);
  console.log(`PASS: ${description}: ${file} (${size} bytes)`);
}

function installedAsarPath() {
  if (process.platform !== 'win32') return null;
  const productName = pkg.build?.productName || 'Bright Forge Portal';
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'bright-forge-portal', 'resources', 'app.asar'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', productName, 'resources', 'app.asar'),
    path.join(process.env.PROGRAMFILES || '', productName, 'resources', 'app.asar'),
  ].filter(Boolean);
  return candidates.find(fs.existsSync) || candidates[0];
}

(async () => {
  const failures = [];
  function check(name, fn) {
    return Promise.resolve().then(fn).then(() => console.log(`PASS: ${name}`)).catch((error) => {
      failures.push(`${name}: ${error.message}`);
      console.error(`FAIL: ${name}: ${error.message}`);
    });
  }

  await check('live portal /version matches package.json', async () => {
    const liveRaw = await fetchText(liveVersionUrl);
    let liveVersion = liveRaw;
    try {
      const parsed = JSON.parse(liveRaw);
      liveVersion = parsed.version || liveRaw;
    } catch (_) {}
    if (liveVersion !== version) throw new Error(`expected ${version}, got ${liveVersion}`);
  });

  await check('local dist has installer and latest.yml', async () => {
    assertFile(path.join(root, 'dist', `BrightForgePortal-${version}-x64-win.exe`), 'installer');
    const latestYml = fs.readFileSync(path.join(root, 'dist', 'latest.yml'), 'utf8');
    if (!latestYml.includes(`version: ${version}`) || !latestYml.includes(`BrightForgePortal-${version}-x64-win.exe`)) {
      throw new Error('latest.yml does not reference the current installer version');
    }
  });

  await check('GitHub latest release matches package.json and has updater assets', async () => {
    const latest = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
    const latestVersion = String(latest.tag_name || latest.name || '').replace(/^v/i, '');
    if (latestVersion !== version) throw new Error(`expected v${version}, got ${latest.tag_name || latest.name || 'unknown'}`);
    const assetNames = (latest.assets || []).map((asset) => asset.name);
    for (const asset of [`BrightForgePortal-${version}-x64-win.exe`, 'latest.yml']) {
      if (!assetNames.includes(asset)) throw new Error(`missing ${asset}`);
    }
  });

  await check('local installed app matches package.json', async () => {
    if (process.platform !== 'win32') return;
    const appAsar = installedAsarPath();
    assertFile(appAsar, 'installed app.asar');
    const installedPkg = JSON.parse(asar.extractFile(appAsar, 'package.json').toString('utf8'));
    if (installedPkg.version !== version) throw new Error(`expected ${version}, got ${installedPkg.version}`);
  });

  if (failures.length) {
    console.error('\nRelease surface verification failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`\nRelease surfaces verified for ${version}.`);
})();
