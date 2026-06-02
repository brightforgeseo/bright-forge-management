const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public');
const dest = path.join(root, 'dist');

if (!fs.existsSync(src)) process.exit(0);
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true, force: true });
console.log(`[copy-public] copied ${src} -> ${dest}`);
