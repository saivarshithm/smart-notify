import type { NotificationItem, SmartRules } from './types.js';

const CURRENT_VERSION = 'v1.0.6';
const GITHUB_REPO = 'saivarshithm/smart-notify';

declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T = any>(cmd: string, args?: Record<string, any>) => Promise<T>;
      };
      event: {
        listen: <T = any>(
          event: string,
          handler: (event: { event: string; payload: T }) => void
        ) => Promise<() => void>;
      };
      window?: {
        getCurrentWindow: () => {
          hide: () => Promise<void>;
          minimize: () => Promise<void>;
          close: () => Promise<void>;
        };
      };
    };
  }
}

async function tauriInvoke<T = any>(cmd: string, args?: Record<string, any>): Promise<T | null> {
  if (window.__TAURI__?.core?.invoke) {
    try {
      return await window.__TAURI__.core.invoke<T>(cmd, args);
    } catch (e) {
      console.warn(`[Tauri invoke error] ${cmd}:`, e);
      return null;
    }
  }
  console.log(`[Mock Dashboard Invoke] ${cmd}`, args);
  return null;
}

// Current Rules in memory
let currentRules: SmartRules = {
  muted_apps: ['Microsoft.Windows.ShellExperienceHost', 'Windows.SystemToast.Suggested'],
  urgent_keywords: ['otp', 'verification', 'verify', '2fa', 'urgent', 'critical', 'build failed', 'alert'],
  burst_window_ms: 4000,
  burst_threshold: 3,
  normal_duration_ms: 5500,
  urgent_duration_ms: 9000,
  suppress_fullscreen: true,
};

let allHistoryItems: NotificationItem[] = [];

// DOM Elements
const navItems = document.querySelectorAll<HTMLButtonElement>('.nav-item');
const tabPanes = document.querySelectorAll<HTMLElement>('.tab-pane');
const minimizeBtn = document.getElementById('minimize-dashboard-btn') as HTMLButtonElement;
const historyNavCount = document.getElementById('history-nav-count') as HTMLElement;

// Header Buttons
const headerTestBtn = document.getElementById('header-test-btn') as HTMLButtonElement;
const headerUpdateBtn = document.getElementById('header-update-btn') as HTMLButtonElement;

// Rules Elements
const mutedAppsContainer = document.getElementById('muted-apps-container') as HTMLElement;
const newMutedAppInput = document.getElementById('new-muted-app-input') as HTMLInputElement;
const addMutedAppBtn = document.getElementById('add-muted-app-btn') as HTMLButtonElement;

const urgentKeywordsContainer = document.getElementById('urgent-keywords-container') as HTMLElement;
const newKeywordInput = document.getElementById('new-keyword-input') as HTMLInputElement;
const addKeywordBtn = document.getElementById('add-keyword-btn') as HTMLButtonElement;

const sliderNormalDur = document.getElementById('slider-normal-dur') as HTMLInputElement;
const valNormalDur = document.getElementById('val-normal-dur') as HTMLElement;
const sliderUrgentDur = document.getElementById('slider-urgent-dur') as HTMLInputElement;
const valUrgentDur = document.getElementById('val-urgent-dur') as HTMLElement;
const cbSuppressFullscreen = document.getElementById('cb-suppress-fullscreen') as HTMLInputElement;

const saveRulesBtn = document.getElementById('save-rules-btn') as HTMLButtonElement;
const openRulesFileBtn = document.getElementById('open-rules-file-btn') as HTMLButtonElement;

// Testing Lab Elements
const testBtnNormal = document.getElementById('test-btn-normal') as HTMLButtonElement;
const testBtnUrgent = document.getElementById('test-btn-urgent') as HTMLButtonElement;
const testBtnBurst = document.getElementById('test-btn-burst') as HTMLButtonElement;
const testBtnStack = document.getElementById('test-btn-stack') as HTMLButtonElement;

// Custom Test Lab Elements
const customAppName = document.getElementById('custom-app-name') as HTMLInputElement;
const customTitle = document.getElementById('custom-title') as HTMLInputElement;
const customBody = document.getElementById('custom-body') as HTMLInputElement;
const customSendBtn = document.getElementById('custom-send-btn') as HTMLButtonElement;

// History Elements
const dashboardHistorySearch = document.getElementById('dashboard-history-search') as HTMLInputElement;
const dashboardHistoryList = document.getElementById('dashboard-history-list') as HTMLElement;
const dashboardClearHistoryBtn = document.getElementById('dashboard-clear-history-btn') as HTMLButtonElement;

// Updates Elements
const dashboardCheckUpdatesBtn = document.getElementById('dashboard-check-updates-btn') as HTMLButtonElement;
const updateStatusDesc = document.getElementById('update-status-desc') as HTMLElement;
const linkGithubRepo = document.getElementById('link-github-repo') as HTMLAnchorElement;
const linkGithubReleases = document.getElementById('link-github-releases') as HTMLAnchorElement;
const linkPrivacySettings = document.getElementById('link-privacy-settings') as HTMLAnchorElement;
const overviewOpenSettingsBtn = document.getElementById('overview-open-settings-btn') as HTMLButtonElement;
const toggleFocusBtn = document.getElementById('toggle-focus-btn') as HTMLButtonElement;
const openOverlayDrawerBtn = document.getElementById('open-overlay-drawer-btn') as HTMLButtonElement;

// Tab Switching
function setupTabs() {
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      navItems.forEach((n) => n.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(targetTab || '');
      if (pane) pane.classList.add('active');

      if (targetTab === 'tab-history') {
        loadHistory();
      }
    });
  });
}

// Rules Manager
function renderMutedApps() {
  mutedAppsContainer.innerHTML = '';
  currentRules.muted_apps.forEach((app, idx) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `<span>${escapeHtml(app)}</span><span class="tag-remove-btn" title="Remove">&times;</span>`;
    pill.querySelector('.tag-remove-btn')?.addEventListener('click', () => {
      currentRules.muted_apps.splice(idx, 1);
      renderMutedApps();
    });
    mutedAppsContainer.appendChild(pill);
  });
}

function renderUrgentKeywords() {
  urgentKeywordsContainer.innerHTML = '';
  currentRules.urgent_keywords.forEach((kw, idx) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `<span>${escapeHtml(kw)}</span><span class="tag-remove-btn" title="Remove">&times;</span>`;
    pill.querySelector('.tag-remove-btn')?.addEventListener('click', () => {
      currentRules.urgent_keywords.splice(idx, 1);
      renderUrgentKeywords();
    });
    urgentKeywordsContainer.appendChild(pill);
  });
}

async function loadRules() {
  const loaded = await tauriInvoke<SmartRules>('get_smart_rules');
  if (loaded) {
    currentRules = loaded;
  }
  renderMutedApps();
  renderUrgentKeywords();

  sliderNormalDur.value = currentRules.normal_duration_ms.toString();
  valNormalDur.textContent = (currentRules.normal_duration_ms / 1000).toFixed(1);

  sliderUrgentDur.value = currentRules.urgent_duration_ms.toString();
  valUrgentDur.textContent = (currentRules.urgent_duration_ms / 1000).toFixed(1);

  cbSuppressFullscreen.checked = currentRules.suppress_fullscreen;
}

function setupRulesForm() {
  addMutedAppBtn.addEventListener('click', () => {
    const val = newMutedAppInput.value.trim();
    if (val && !currentRules.muted_apps.includes(val)) {
      currentRules.muted_apps.push(val);
      renderMutedApps();
      newMutedAppInput.value = '';
    }
  });

  newMutedAppInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addMutedAppBtn.click();
  });

  addKeywordBtn.addEventListener('click', () => {
    const val = newKeywordInput.value.trim();
    if (val && !currentRules.urgent_keywords.includes(val.toLowerCase())) {
      currentRules.urgent_keywords.push(val.toLowerCase());
      renderUrgentKeywords();
      newKeywordInput.value = '';
    }
  });

  newKeywordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addKeywordBtn.click();
  });

  sliderNormalDur.addEventListener('input', () => {
    const ms = Number(sliderNormalDur.value);
    valNormalDur.textContent = (ms / 1000).toFixed(1);
    currentRules.normal_duration_ms = ms;
  });

  sliderUrgentDur.addEventListener('input', () => {
    const ms = Number(sliderUrgentDur.value);
    valUrgentDur.textContent = (ms / 1000).toFixed(1);
    currentRules.urgent_duration_ms = ms;
  });

  cbSuppressFullscreen.addEventListener('change', () => {
    currentRules.suppress_fullscreen = cbSuppressFullscreen.checked;
  });

  saveRulesBtn.addEventListener('click', async () => {
    saveRulesBtn.textContent = 'Saving...';
    await tauriInvoke('save_smart_rules', { rules: currentRules });
    setTimeout(() => {
      saveRulesBtn.textContent = 'Saved Successfully!';
      setTimeout(() => {
        saveRulesBtn.textContent = 'Save & Apply Rules';
      }, 1500);
    }, 300);
  });

  openRulesFileBtn.addEventListener('click', () => {
    tauriInvoke('open_rules_file');
  });
}

// Test Lab Actions
function setupTestLab() {
  testBtnNormal.addEventListener('click', () => {
    tauriInvoke('send_test_notification', {
      payload: {
        app_id: 'com.spotify.music',
        app_name: 'Spotify',
        title: 'Starboy (feat. Daft Punk)',
        body: 'The Weeknd • Starboy (Standard 5.5s banner)',
        is_urgent: false,
      },
    });
  });

  testBtnUrgent.addEventListener('click', () => {
    tauriInvoke('send_test_notification', {
      payload: {
        app_id: 'com.microsoft.authenticator',
        app_name: 'Microsoft Authenticator',
        title: '2FA Verification Code: 940212',
        body: 'URGENT: Do not share this OTP. Extended 9s duration with glowing crimson ring.',
        is_urgent: true,
      },
    });
  });

  testBtnBurst.addEventListener('click', () => {
    for (let i = 1; i <= 3; i++) {
      setTimeout(() => {
        tauriInvoke('send_test_notification', {
          payload: {
            app_id: 'com.whatsapp.desktop',
            app_name: 'WhatsApp',
            title: 'Alex (Development Sync)',
            body: `Message ${i}: Sending deployment notes...`,
            is_urgent: false,
          },
        });
      }, (i - 1) * 300);
    }
  });

  testBtnStack.addEventListener('click', () => {
    tauriInvoke('send_test_notification', {
      payload: {
        app_id: 'com.tinyspeck.slack',
        app_name: 'Slack',
        title: 'Engineering Team (#general)',
        body: `Release update ${Math.floor(Math.random() * 100)}: Test notification pushed to deck.`,
        is_urgent: false,
      },
    });
  });

  customSendBtn.addEventListener('click', () => {
    const app = customAppName.value.trim() || 'Custom App';
    const title = customTitle.value.trim() || 'Test Title';
    const body = customBody.value.trim() || 'Test Message';

    tauriInvoke('send_test_notification', {
      payload: {
        app_id: `custom.${app.toLowerCase().replace(/\s+/g, '.')}`,
        app_name: app,
        title,
        body,
        is_urgent: null,
      },
    });
  });

  headerTestBtn.addEventListener('click', () => {
    testBtnNormal.click();
  });

  headerUpdateBtn.addEventListener('click', () => {
    const updatesTab = document.querySelector<HTMLButtonElement>('[data-tab="tab-updates"]');
    updatesTab?.click();
    checkUpdates();
  });
}

// History Manager
async function loadHistory(query: string = '') {
  allHistoryItems = (await tauriInvoke<NotificationItem[]>('get_notification_history')) || [];
  if (historyNavCount) {
    historyNavCount.textContent = allHistoryItems.length.toString();
  }
  renderHistoryTable(query);
}

function renderHistoryTable(query: string = '') {
  const filtered = query.trim()
    ? allHistoryItems.filter(
        (h) =>
          h.title.toLowerCase().includes(query.toLowerCase()) ||
          h.body.toLowerCase().includes(query.toLowerCase()) ||
          h.app_name.toLowerCase().includes(query.toLowerCase())
      )
    : allHistoryItems;

  if (filtered.length === 0) {
    dashboardHistoryList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">No alerts recorded in memory yet.</div>`;
    return;
  }

  dashboardHistoryList.innerHTML = filtered
    .map(
      (item) => `
    <div class="history-row">
      <div class="history-app">${escapeHtml(item.app_name)}</div>
      <div class="history-content">
        <div class="history-title">${escapeHtml(item.title)}</div>
        <div class="history-body">${escapeHtml(item.body)}</div>
      </div>
      <div class="history-time">${formatTime(item.timestamp)}</div>
    </div>
  `
    )
    .join('');
}

function setupHistory() {
  dashboardHistorySearch.addEventListener('input', (e) => {
    renderHistoryTable((e.target as HTMLInputElement).value);
  });

  dashboardClearHistoryBtn.addEventListener('click', async () => {
    await tauriInvoke('clear_notification_history');
    await loadHistory();
  });
}

// Update Checker
async function checkUpdates() {
  updateStatusDesc.textContent = 'Checking GitHub Releases...';
  dashboardCheckUpdatesBtn.disabled = true;

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) {
      updateStatusDesc.textContent = 'Unable to check for updates right now. Please check your internet connection.';
      return;
    }
    const data = await res.json();
    const latestVersion = data.tag_name || data.name;
    const releaseUrl = data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`;

    if (latestVersion && latestVersion !== CURRENT_VERSION) {
      updateStatusDesc.innerHTML = `<strong>A newer version is available: ${escapeHtml(latestVersion)}</strong> (Current: ${CURRENT_VERSION})<br><a href="#" id="btn-download-latest" style="color: var(--accent-primary); text-decoration: underline; display: inline-block; margin-top: 6px;">Click here to download release &rarr;</a>`;
      document.getElementById('btn-download-latest')?.addEventListener('click', (e) => {
        e.preventDefault();
        tauriInvoke('open_url', { url: releaseUrl });
      });
    } else {
      updateStatusDesc.textContent = `You're on the newest version (${CURRENT_VERSION}). Smart Notify is up to date!`;
    }
  } catch (e) {
    updateStatusDesc.textContent = 'Could not connect to GitHub. Please check your connection.';
  } finally {
    dashboardCheckUpdatesBtn.disabled = false;
  }
}

function setupUpdatesAndLinks() {
  dashboardCheckUpdatesBtn.addEventListener('click', checkUpdates);

  linkGithubRepo.addEventListener('click', (e) => {
    e.preventDefault();
    tauriInvoke('open_url', { url: `https://github.com/${GITHUB_REPO}` });
  });

  linkGithubReleases.addEventListener('click', (e) => {
    e.preventDefault();
    tauriInvoke('open_url', { url: `https://github.com/${GITHUB_REPO}/releases` });
  });

  linkPrivacySettings.addEventListener('click', (e) => {
    e.preventDefault();
    tauriInvoke('open_notification_settings');
  });

  overviewOpenSettingsBtn.addEventListener('click', () => {
    tauriInvoke('open_notification_settings');
  });

  let focusActive = false;
  toggleFocusBtn.addEventListener('click', async () => {
    focusActive = (await tauriInvoke('toggle_smart_focus_mode')) || false;
    const subtext = document.getElementById('focus-toggle-subtext');
    const badge = document.getElementById('overview-focus-badge');
    const text = document.getElementById('overview-focus-text');

    if (subtext) subtext.textContent = focusActive ? 'Paused for 1 hour' : 'Pause non-urgent alerts';
    if (badge) {
      badge.textContent = focusActive ? 'ACTIVE' : 'INACTIVE';
      badge.className = focusActive ? 'badge badge-success' : 'badge badge-neutral';
    }
    if (text) text.textContent = focusActive ? 'Paused (1 hr)' : 'Normal Delivery';
  });

  openOverlayDrawerBtn.addEventListener('click', () => {
    tauriInvoke('toggle-history');
  });

  minimizeBtn.addEventListener('click', () => {
    if (window.__TAURI__?.window?.getCurrentWindow) {
      window.__TAURI__.window.getCurrentWindow().hide();
    }
  });
}

function formatTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 10) return 'now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function init() {
  setupTabs();
  await loadRules();
  setupRulesForm();
  setupTestLab();
  setupHistory();
  setupUpdatesAndLinks();
  await loadHistory();
  console.log('Smart Notify Pro Dashboard initialized.');
}

window.addEventListener('DOMContentLoaded', init);
