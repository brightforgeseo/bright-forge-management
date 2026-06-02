const path = require('path');
const { rcedit } = require('rcedit');

const root = path.resolve(__dirname, '..');
const exe = process.argv[2] || path.join(root, 'dist', 'win-unpacked', 'Bright Forge Portal.exe');
const icon = path.join(root, 'assets', 'icon.ico');
const version = require(path.join(root, 'package.json')).version;

rcedit(exe, {
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
}).then(() => {
  console.log(JSON.stringify({ status: 'patched', exe, icon, version }, null, 2));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
