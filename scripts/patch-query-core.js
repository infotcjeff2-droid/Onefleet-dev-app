#!/usr/bin/env node
/**
 * Patch script: Workaround for @tanstack/query-core 5.101.4
 *
 * npm registry has a broken 5.101.4 release where the package.json
 * `main`/`module` fields point to `./build/legacy/index.js`, but the
 * build artifacts only ship `index.cjs` (no `.js`). This causes Metro
 * bundler errors like:
 *
 *   The package ... @tanstack/query-core ... `main` module field that
 *   could not be resolved (...build/legacy/index.js)
 *
 * This script creates `.js` shims that re-export from the existing `.cjs`,
 * so Metro/Node can resolve the package. Remove this once TanStack ships
 * a version that has actual `.js` artifacts again.
 */
const fs = require('fs');
const path = require('path');

const targets = [
  'node_modules/@tanstack/query-core/build/legacy/index.js',
  'node_modules/@tanstack/query-core/build/modern/index.js',
];

const root = path.resolve(__dirname, '..');
let touched = false;

for (const rel of targets) {
  const abs = path.join(root, rel);
  const dir = path.dirname(abs);

  if (!fs.existsSync(dir)) continue;

  if (!fs.existsSync(abs)) {
    fs.writeFileSync(abs, "module.exports = require('./index.cjs');\n");
    console.log(`[patch-query-core] Created shim: ${rel}`);
    touched = true;
  }
}

if (!touched) {
  console.log('[patch-query-core] All shims already in place.');
}
