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

const tsFiles = ['types.ts', 'physics.ts', 'main.ts', 'dashboard.ts'];

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
    fs.copyFileSync(srcJsPath, distPath);
    console.log(`[build] Copied ${outFileName} -> dist/${outFileName}`);
  } else if (fs.existsSync(srcTsPath)) {
    fs.copyFileSync(srcTsPath, distPath);
  }
}

// 2. Copy CSS files to dist/
const cssFiles = ['style.css', 'dashboard.css'];
for (const css of cssFiles) {
  const cssPath = path.join(SRC_DIR, css);
  if (fs.existsSync(cssPath)) {
    fs.copyFileSync(cssPath, path.join(DIST_DIR, css));
    console.log(`[build] Copied ${css} -> dist/${css}`);
  }
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

// 4. Process dashboard.html for dist/
const dashboardHtmlPath = path.join(ROOT_DIR, 'dashboard.html');
if (fs.existsSync(dashboardHtmlPath)) {
  let html = fs.readFileSync(dashboardHtmlPath, 'utf8');
  html = html.replace('./src/dashboard.js', './dashboard.js');
  html = html.replace('./src/dashboard.ts', './dashboard.js');
  html = html.replace('./src/dashboard.css', './dashboard.css');

  fs.writeFileSync(path.join(DIST_DIR, 'dashboard.html'), html, 'utf8');
  console.log('[build] Generated dist/dashboard.html');
}

// 5. Copy app logo to dist for dashboard view
const logoPath = path.join(ROOT_DIR, 'smart-notify-logo.png');
if (fs.existsSync(logoPath)) {
  fs.copyFileSync(logoPath, path.join(DIST_DIR, 'smart-notify-logo.png'));
}

console.log('[build] Build completed successfully.');
