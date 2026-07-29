const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Workaround for @tanstack/query-core 5.101.4 missing index.js files
// (npm published a broken version where package.json main/module field
// points to ./build/legacy/index.js but only index.cjs exists)
const queryCoreLegacyShim = path.resolve(__dirname, 'node_modules/@tanstack/query-core/build/legacy/index.js');
const queryCoreModernShim = path.resolve(__dirname, 'node_modules/@tanstack/query-core/build/modern/index.js');
const fs = require('fs');

function ensureQueryCoreShim() {
  for (const shim of [queryCoreLegacyShim, queryCoreModernShim]) {
    if (!fs.existsSync(shim)) {
      fs.mkdirSync(path.dirname(shim), { recursive: true });
      fs.writeFileSync(shim, "module.exports = require('./index.cjs');\n");
    }
  }
}

ensureQueryCoreShim();

module.exports = config;
