// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

// ─── Patch ALL zustand ESM files for web compatibility ────────────────────────
function patchZustandFiles() {
  const zustandEsmDir = path.resolve(__dirname, 'node_modules/zustand/esm');
  
  if (!fs.existsSync(zustandEsmDir)) return;
  
  const files = fs.readdirSync(zustandEsmDir).filter(f => f.endsWith('.mjs'));
  
  for (const file of files) {
    const filePath = path.join(zustandEsmDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    let modified = content.replace(/import\.meta\.env\.MODE/g, "'development'");
    modified = modified.replace(/import\.meta\.env(?!\.\w)/g, "({ MODE: 'development', DEV: true, PROD: false })");
    
    if (modified !== content) {
      fs.writeFileSync(filePath, modified, 'utf8');
      console.log(`[metro] Patched zustand/esm/${file}`);
    }
  }
}

patchZustandFiles();

// ─── Block project's api/ directory ─────────────────────────────────────────
const projectApiPath = path.resolve(__dirname, 'api') + path.sep;
config.resolverBlockList = config.resolverBlockList || [];
const escaped = projectApiPath.replace(/\\/g, '\\\\');
if (!config.resolverBlockList.some(p => p.toString().includes(escaped))) {
  config.resolverBlockList.push(new RegExp(escaped));
}

module.exports = config;
