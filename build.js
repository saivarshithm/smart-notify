import fs from 'node:fs';
import path from 'node:path';
import moduleApi from 'node:module';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

console.log('[build] Starting Smart Notify frontend build...');

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Check if stripTypeScriptTypes is natively supported by this Node version
const hasNativeStrip = typeof moduleApi.stripTypeScriptTypes === 'function';

const tsFiles = ['types.ts', 'physics.ts', 'main.ts'];

for (const file of tsFiles) {
  const srcTsPath = path.join(SRC_DIR, file);
  const outFileName = file.replace(/\.ts$/, '.js');
  const distPath = path.join(DIST_DIR, outFileName);
  const srcJsPath = path.join(SRC_DIR, outFileName);

  if (hasNativeStrip && fs.existsSync(srcTsPath)) {
    const rawTs = fs.readFileSync(srcTsPath, 'utf8');
    const strippedJs = moduleApi.stripTypeScriptTypes(rawTs);
    fs.writeFileSync(distPath, strippedJs, 'utf8');
    fs.writeFileSync(srcJsPath, strippedJs, 'utf8');
    console.log(`[build] Transpiled ${file} -> dist/${outFileName}`);
  } else if (fs.existsSync(srcJsPath)) {
    // Fallback: Copy pre-generated JS file
    fs.copyFileSync(srcJsPath, distPath);
    console.log(`[build] Copied ${outFileName} -> dist/${outFileName}`);
  } else if (fs.existsSync(srcTsPath)) {
    // Basic regex-free fallback for plain JS
    fs.copyFileSync(srcTsPath, distPath);
  }
}

// 2. Copy style.css to dist/
const cssPath = path.join(SRC_DIR, 'style.css');
if (fs.existsSync(cssPath)) {
  fs.copyFileSync(cssPath, path.join(DIST_DIR, 'style.css'));
  console.log('[build] Copied style.css -> dist/style.css');
}

// 3. Process index.html for dist/
const indexHtmlPath = path.join(ROOT_DIR, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  let html = fs.readFileSync(indexHtmlPath, 'utf8');
  html = html.replace('./src/main.js', './main.js');
  html = html.replace('./src/main.ts', './main.js');
  html = html.replace('./style.css', './style.css');

  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf8');
  console.log('[build] Generated dist/index.html');
}

console.log('[build] Build completed successfully.');
