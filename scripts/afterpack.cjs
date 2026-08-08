// electron-builder afterPack hook.
//
// Windows builds have shipped with the default Electron icon despite
// build.win.icon being set (scripts/patch-windows-exe-icon.cjs existed for
// manual repair but was never wired into CI). Running rcedit here stamps
// the icon and version metadata onto the exe before the installer is built,
// so every release gets the Bright Forge icon automatically.

const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  // Linux release builders may not have Wine. The Windows host release path
  // still stamps icon/version metadata normally; this escape hatch allows a
  // functionally identical emergency installer to be built without Wine.
  if (process.env.SKIP_RCEDIT === '1') {
    console.log('[afterPack] skipped Windows resource stamping (SKIP_RCEDIT=1)');
    return;
  }

  const rceditModule = await import('rcedit');
  const rcedit = rceditModule.rcedit || rceditModule.default;
  const root = path.resolve(__dirname, '..');
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icon = path.join(root, 'assets', 'icon.ico');
  const version = require(path.join(root, 'package.json')).version;

  await rcedit(exe, {
    icon,
    'file-version': version,
    'product-version': version,
    'version-string': {
      FileDescription: 'Bright Forge Portal',
      ProductName: 'Bright Forge Portal',
      InternalName: 'Bright Forge Portal',
      OriginalFilename: 'Bright Forge Portal.exe',
      CompanyName: 'Bright Forge SEO',
    },
  });
  console.log(`[afterPack] stamped icon + version ${version} on ${exe}`);
};
