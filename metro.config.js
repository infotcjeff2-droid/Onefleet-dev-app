// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Workaround for @tanstack/query-core 5.101.4 missing index.js files
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

// Exclude project's `api/` directory from Metro.
const projectApiPath = path.resolve(__dirname, 'api') + path.sep;
config.resolverBlockList = config.resolverBlockList || [];
const escaped = projectApiPath.replace(/\\/g, '\\\\');
if (!config.resolverBlockList.some(p => p.toString().includes(escaped))) {
  config.resolverBlockList.push(new RegExp(escaped));
}

module.exports = config;
