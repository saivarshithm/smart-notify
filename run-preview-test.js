import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 3000;
const ROOT_DIR = process.cwd();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url === '/' ? '/preview.html' : req.url;
  reqPath = reqPath.split('?')[0];

  const filePath = path.join(ROOT_DIR, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, async () => {
  console.log(`[Preview Server] Running on http://localhost:${PORT}`);

  try {
    const endpoints = ['/preview.html', '/dist/style.css', '/dist/main.js', '/dist/physics.js'];
    let allOk = true;

    for (const ep of endpoints) {
      const res = await fetch(`http://localhost:${PORT}${ep}`);
      const text = await res.text();
      console.log(`[Test Probe] GET ${ep} -> Status ${res.status} (${text.length} bytes)`);
      if (res.status !== 200 || text.length === 0) {
        allOk = false;
      }
    }

    if (allOk) {
      console.log('✅ [TEST SUCCESS] All preview assets served and verified successfully.');
    } else {
      console.error('❌ [TEST FAIL] Some assets failed verification.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('❌ [TEST ERROR]', err);
    process.exitCode = 1;
  } finally {
    server.close(() => {
      console.log('[Preview Server] Closed cleanly.');
    });
  }
});
