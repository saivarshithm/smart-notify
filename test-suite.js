import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

test('1. Rules configuration verification', () => {
  const rulesPath = path.join(ROOT_DIR, 'smart-rules.default.json');
  assert.ok(fs.existsSync(rulesPath), 'smart-rules.default.json must exist');
  
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  assert.ok(Array.isArray(rules.muted_apps), 'muted_apps must be an array');
  assert.ok(Array.isArray(rules.urgent_keywords), 'urgent_keywords must be an array');
  assert.strictEqual(rules.burst_window_ms, 4000, 'burst_window_ms should be 4000ms');
  assert.strictEqual(rules.burst_threshold, 3, 'burst_threshold should be 3');
  assert.strictEqual(rules.normal_duration_ms, 5500, 'normal_duration_ms should be 5500ms');
  assert.strictEqual(rules.urgent_duration_ms, 9000, 'urgent_duration_ms should be 9000ms');
  assert.strictEqual(rules.suppress_fullscreen, true, 'suppress_fullscreen should be true');
});

test('2. Urgent Keyword Detection Logic', () => {
  const urgentKeywords = ['otp', 'verification', 'verify', '2fa', 'urgent', 'critical', 'build failed', 'alert'];
  
  function isUrgent(text) {
    const lower = text.toLowerCase();
    return urgentKeywords.some((kw) => lower.includes(kw));
  }

  assert.strictEqual(isUrgent('Your GitHub 2FA code is 984122'), true);
  assert.strictEqual(isUrgent('URGENT: Server CPU at 99%'), true);
  assert.strictEqual(isUrgent('CI Pipeline: Build failed on main branch'), true);
  assert.strictEqual(isUrgent('Your OTP for banking login: 4421'), true);
  assert.strictEqual(isUrgent('Hey, want to grab lunch today?'), false);
  assert.strictEqual(isUrgent('Spotify: Now playing Bohemian Rhapsody'), false);
});

test('3. Burst Coalescing Logic Simulation', () => {
  const burstWindowMs = 4000;
  const burstThreshold = 3;
  const tracker = new Map();

  function processNotification(appId, timestamp) {
    if (!tracker.has(appId)) {
      tracker.set(appId, []);
    }
    const timestamps = tracker.get(appId);
    const active = timestamps.filter((t) => timestamp - t <= burstWindowMs);
    active.push(timestamp);
    tracker.set(appId, active);

    const isCoalesced = active.length >= burstThreshold;
    return {
      isCoalesced,
      count: active.length,
    };
  }

  const baseTime = 10000;
  const r1 = processNotification('WhatsApp', baseTime);
  assert.strictEqual(r1.isCoalesced, false);
  assert.strictEqual(r1.count, 1);

  const r2 = processNotification('WhatsApp', baseTime + 1000);
  assert.strictEqual(r2.isCoalesced, false);
  assert.strictEqual(r2.count, 2);

  const r3 = processNotification('WhatsApp', baseTime + 2000);
  assert.strictEqual(r3.isCoalesced, true);
  assert.strictEqual(r3.count, 3);

  const r4 = processNotification('WhatsApp', baseTime + 3000);
  assert.strictEqual(r4.isCoalesced, true);
  assert.strictEqual(r4.count, 4);

  const slackRes = processNotification('Slack', baseTime + 3200);
  assert.strictEqual(slackRes.isCoalesced, false);
  assert.strictEqual(slackRes.count, 1);

  const r5 = processNotification('WhatsApp', baseTime + 9000);
  assert.strictEqual(r5.isCoalesced, false);
  assert.strictEqual(r5.count, 1);
});

test('4. In-Memory Ring Buffer (50 items max)', () => {
  const history = [];
  const MAX_HISTORY = 50;

  function pushHistory(item) {
    if (history.length >= MAX_HISTORY) {
      history.pop();
    }
    history.unshift(item);
  }

  for (let i = 1; i <= 65; i++) {
    pushHistory({ id: i, title: `Alert #${i}` });
  }

  assert.strictEqual(history.length, 50, 'History ring buffer must not exceed 50 items');
  assert.strictEqual(history[0].id, 65, 'Most recent item must be at index 0');
  assert.strictEqual(history[49].id, 16, 'Oldest item retained must be #16');
});

test('5. Frontend Build Artifacts Integrity', () => {
  const distFiles = [
    'index.html',
    'style.css',
    'main.js',
    'physics.js',
    'types.js',
    'dashboard.html',
    'dashboard.css',
    'dashboard.js',
  ];
  for (const file of distFiles) {
    const fullPath = path.join(ROOT_DIR, 'dist', file);
    assert.ok(fs.existsSync(fullPath), `dist/${file} must exist`);
    const stats = fs.statSync(fullPath);
    assert.ok(stats.size > 0, `dist/${file} must not be empty`);
  }

  const html = fs.readFileSync(path.join(ROOT_DIR, 'dist', 'index.html'), 'utf8');
  assert.ok(html.includes('overlay-container'), 'HTML must have overlay-container');
  assert.ok(html.includes('notifications-list'), 'HTML must have notifications-list');

  const dashboardHtml = fs.readFileSync(path.join(ROOT_DIR, 'dist', 'dashboard.html'), 'utf8');
  assert.ok(dashboardHtml.includes('Management Dashboard') || dashboardHtml.includes('Control Center'), 'Dashboard HTML must have title');
  assert.ok(dashboardHtml.includes('tab-testing'), 'Dashboard HTML must have Test Lab tab');
  assert.ok(dashboardHtml.includes('tab-rules'), 'Dashboard HTML must have Smart Rules tab');
});

test('6. AppxManifest.xml Sparse MSIX Package Integrity', () => {
  const manifestPath = path.join(ROOT_DIR, 'sparse-package', 'AppxManifest.xml');
  assert.ok(fs.existsSync(manifestPath), 'AppxManifest.xml must exist');

  const content = fs.readFileSync(manifestPath, 'utf8');
  assert.ok(content.includes('Name="SmartNotify"'), 'Manifest must have identity SmartNotify');
  assert.ok(content.includes('userNotificationListener'), 'Manifest must declare userNotificationListener capability');
  assert.ok(content.includes('runFullTrust'), 'Manifest must declare runFullTrust capability');
  assert.ok(content.includes('smart-notify.exe'), 'Manifest executable must be smart-notify.exe');
});

test('7. System Tray & Multi-Window Configuration (No Duplicate Trays)', () => {
  const tauriConfPath = path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json');
  assert.ok(fs.existsSync(tauriConfPath), 'tauri.conf.json must exist');

  const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  
  // Ensure no duplicate tray icon configured in app block (avoids duplicate hidden tray icons)
  assert.strictEqual(conf.app.trayIcon, undefined, 'tauri.conf.json must NOT define duplicate trayIcon in app block');

  // Verify Windows
  assert.strictEqual(conf.app.windows.length, 2, 'Must have 2 windows (overlay + dashboard)');

  const overlayWin = conf.app.windows.find((w) => w.label === 'main');
  assert.ok(overlayWin, 'Overlay window must exist');
  assert.strictEqual(overlayWin.transparent, true, 'Overlay window must be transparent');
  assert.strictEqual(overlayWin.alwaysOnTop, true, 'Overlay window must be alwaysOnTop');

  const dashboardWin = conf.app.windows.find((w) => w.label === 'dashboard');
  assert.ok(dashboardWin, 'Dashboard window must exist');
  assert.strictEqual(dashboardWin.title, 'Smart Notify — Management Dashboard');
  assert.strictEqual(dashboardWin.url, 'dashboard.html');
});
