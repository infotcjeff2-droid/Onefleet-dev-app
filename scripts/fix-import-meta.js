// Post-build script: replace any remaining `import.meta` references in
// the generated bundle with safe fallbacks.
//
// Why: some libraries (e.g. zustand/middleware) ship with `import.meta.env.MODE`
// even when bundled for the web. Metro does not transform these, leaving
// invalid JavaScript that the browser rejects with:
//   "Uncaught SyntaxError: Cannot use 'import.meta' outside a module"
//
// Run after `expo export --platform web` (or via npm scripts).
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, files);
    else if (entry.isFile() && p.endsWith('.js')) files.push(p);
  }
  return files;
}

if (!fs.existsSync(DIST)) {
  console.error('[fix-import-meta] dist/ not found, skipping.');
  process.exit(0);
}

const files = walk(DIST);
let totalReplacements = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('import.meta')) continue;
  // Replace `import.meta.env.MODE` first (most specific).
  let out = src.replace(/import\.meta\.env\.MODE/g, '"production"');
  // Replace remaining `import.meta.X` with `undefined`.
  out = out.replace(/import\.meta\.[A-Za-z_$][\w$]*/g, 'undefined');
  // Replace bare `import.meta` (no member) with `({})`.
  out = out.replace(/import\.meta(?![.\w$])/g, '({})');
  if (out !== src) {
    fs.writeFileSync(file, out, 'utf8');
    const count =
      (src.match(/import\.meta\.env\.MODE/g) || []).length +
      (src.match(/import\.meta\.[A-Za-z_$][\w$]*/g) || []).length +
      (src.match(/import\.meta(?![.\w$])/g) || []).length;
    totalReplacements += count;
    console.log(`[fix-import-meta] ${path.relative(path.join(__dirname, '..'), file)} (${count})`);
  }
}

if (totalReplacements === 0) {
  console.log('[fix-import-meta] no replacements needed');
} else {
  console.log(`[fix-import-meta] total replacements: ${totalReplacements}`);
}
