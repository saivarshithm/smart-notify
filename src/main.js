import { attachSwipePhysics } from './physics.js';
                                                                          

// Global Tauri IPC helper
                
                    
                 
             
                                                                                 
        
              
                          
                        
                                                                 
                                 
        
      
   
 

// Fallback invoke for browser testing or Tauri runtime
async function tauriInvoke         (cmd        , args                      )                    {
  if (window.__TAURI__?.core?.invoke) {
    try {
      return await window.__TAURI__.core.invoke   (cmd, args);
    } catch (err) {
      console.warn(`[Tauri invoke error] ${cmd}:`, err);
      return null;
    }
  }
  console.log(`[Mock invoke] ${cmd}`, args);
  return null;
}

// DOM Elements
const overlayContainer = document.getElementById('overlay-container')                  ;
const notificationsList = document.getElementById('notifications-list')                  ;
const permissionBanner = document.getElementById('permission-banner')                  ;
const historyDrawer = document.getElementById('history-drawer')                  ;
const historyList = document.getElementById('history-list')                  ;
const historySearch = document.getElementById('history-search')                    ;
const historyBadge = document.getElementById('history-badge')                   ;
const closeDrawerBtn = document.getElementById('close-drawer-btn')                     ;
const clearHistoryBtn = document.getElementById('clear-history-btn')                     ;
const sendTestBtn = document.getElementById('send-test-btn')                     ;
const focusToggleBtn = document.getElementById('focus-toggle-btn')                     ;
const checkUpdatesBtn = document.getElementById('check-updates-btn')                            ;

// App State
                       
                 
                   
                            
                      
                       
 

const activeStacks = new Map                     ();
const timers = new Map                                                                                                ();
let isHistoryDrawerOpen = false;
let isFocusModeActive = false;
let mouseInsideInteractiveCount = 0;

// Cursor Passthrough Management
function updateCursorEvents() {
  const shouldInteract = mouseInsideInteractiveCount > 0 || isHistoryDrawerOpen;
  tauriInvoke('set_ignore_cursor_events', { ignore: !shouldInteract });
}

function registerInteractive(el             ) {
  el.classList.add('interactive');
  el.addEventListener('pointerenter', () => {
    mouseInsideInteractiveCount++;
    updateCursorEvents();
  });
  el.addEventListener('pointerleave', () => {
    mouseInsideInteractiveCount = Math.max(0, mouseInsideInteractiveCount - 1);
    updateCursorEvents();
  });
}

// Time formatting helper
function formatTime(timestamp        )         {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 10) return 'now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

// Default SVG App Icon fallback
function getDefaultAppIconSvg()         {
  return `<svg class="app-icon-svg" viewBox="0 0 24 24">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
  </svg>`;
}

// Build notification card element
function createCardElement(item                  , isStackChild          = false)              {
  const card = document.createElement('div');
  card.className = `notification-card ${item.is_urgent ? 'is-urgent' : ''} ${isStackChild ? 'stack-item' : ''}`;
  card.dataset.id = item.id.toString();
  card.dataset.appId = item.app_id;

  const iconHtml = item.app_icon_base64
    ? `<img class="app-icon" src="${item.app_icon_base64}" alt="${item.app_name}" />`
    : getDefaultAppIconSvg();

  let bodyContent = `<div class="card-message">${escapeHtml(item.body)}</div>`;
  if (item.is_coalesced && item.coalesced_messages.length > 0) {
    const listHtml = item.coalesced_messages
      .slice(-3)
      .map((m) => `<div class="coalesced-item">${escapeHtml(m)}</div>`)
      .join('');
    bodyContent = `<div class="coalesced-list">${listHtml}</div>`;
  }

  card.innerHTML = `
    <button class="card-close-btn" title="Dismiss" aria-label="Dismiss">×</button>
    <div class="card-inner">
      <div class="app-icon-wrapper">
        ${iconHtml}
      </div>
      <div class="card-body-wrapper">
        <div class="card-header-row">
          <span class="app-name">${escapeHtml(item.app_name)}</span>
          <div class="card-meta-right">
            ${item.coalesce_count > 1 ? `<span class="stack-badge">${item.coalesce_count}</span>` : ''}
            <span class="timestamp">${formatTime(item.timestamp)}</span>
          </div>
        </div>
        <div class="card-title">${escapeHtml(item.title)}</div>
        ${bodyContent}
      </div>
    </div>
    <div class="card-timer-bar">
      <div class="card-timer-fill"></div>
    </div>
  `;

  registerInteractive(card);

  // Close button
  const closeBtn = card.querySelector('.card-close-btn')               ;
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissNotification(item.id, item.app_id);
  });

  // Swipe physics
  attachSwipePhysics(
    card,
    () => dismissNotification(item.id, item.app_id),
    (hovering) => handleCardHover(item.id, hovering)
  );

  // If notification has a clickable link (e.g. software update)
  if (item.action_url) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      if ((e.target               ).closest('.card-close-btn') || (e.target               ).closest('.stack-clear-btn')) {
        return;
      }
      tauriInvoke('open_url', { url: item.action_url });
    });
  }

  return card;
}

// Card Hover Pause / Resume Auto-Dismiss Timer
function handleCardHover(id        , hovering         ) {
  const timerData = timers.get(id);
  if (!timerData) return;

  const fillEl = timerData.cardEl.querySelector('.card-timer-fill')                      ;

  if (hovering) {
    // Pause timer
    clearTimeout(timerData.timerId);
    const elapsed = Date.now() - timerData.start;
    timerData.remaining = Math.max(500, timerData.remaining - elapsed);
    timerData.cardEl.classList.add('paused');
    if (fillEl) {
      fillEl.style.transition = 'none';
      const pct = Math.max(0, timerData.remaining / timerData.total);
      fillEl.style.transform = `scaleX(${pct})`;
    }
  } else {
    // Resume timer
    timerData.start = Date.now();
    timerData.cardEl.classList.remove('paused');
    if (fillEl) {
      fillEl.style.transition = `transform ${timerData.remaining}ms linear`;
      fillEl.style.transform = 'scaleX(0)';
    }
    timerData.timerId = setTimeout(() => {
      const card = timerData.cardEl;
      card.style.transition = 'transform 250ms var(--spring-easing), opacity 220ms ease';
      card.style.transform = 'translateX(110%) scale(0.96)';
      card.style.opacity = '0';
      setTimeout(() => {
        const stack = activeStacks.get(card.dataset.appId || '');
        dismissNotification(id, card.dataset.appId || '');
      }, 230);
    }, timerData.remaining);
  }
}

// Start Auto-Dismiss Timer
function startCardTimer(item                  , cardEl             ) {
  const duration = item.is_urgent ? 9000 : 5500;
  const fillEl = cardEl.querySelector('.card-timer-fill')                      ;

  if (fillEl) {
    fillEl.style.transform = 'scaleX(1)';
    requestAnimationFrame(() => {
      fillEl.style.transition = `transform ${duration}ms linear`;
      fillEl.style.transform = 'scaleX(0)';
    });
  }

  const timerId = setTimeout(() => {
    cardEl.style.transition = 'transform 250ms var(--spring-easing), opacity 220ms ease';
    cardEl.style.transform = 'translateX(110%) scale(0.96)';
    cardEl.style.opacity = '0';
    setTimeout(() => {
      dismissNotification(item.id, item.app_id);
    }, 230);
  }, duration);

  timers.set(item.id, {
    timerId,
    remaining: duration,
    start: Date.now(),
    total: duration,
    cardEl,
  });
}

// Add or update notification in stack
function handleIncomingNotification(item                  ) {
  let stack = activeStacks.get(item.app_id);

  if (!stack) {
    // Create new stack group
    const stackWrapper = document.createElement('div');
    stackWrapper.className = 'stack-group';
    stackWrapper.dataset.appId = item.app_id;

    // Layered deck background edges
    const layer1 = document.createElement('div');
    layer1.className = 'stack-deck-layer-1';
    const layer2 = document.createElement('div');
    layer2.className = 'stack-deck-layer-2';

    // Clear all button for this stack
    const clearStackBtn = document.createElement('button');
    clearStackBtn.className = 'stack-clear-btn';
    clearStackBtn.textContent = 'Clear All';
    clearStackBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissAppStack(item.app_id);
    });

    stackWrapper.appendChild(layer2);
    stackWrapper.appendChild(layer1);
    stackWrapper.appendChild(clearStackBtn);

    const primaryCard = createCardElement(item);
    stackWrapper.appendChild(primaryCard);
    notificationsList.prepend(stackWrapper);

    stack = {
      app_id: item.app_id,
      app_name: item.app_name,
      items: [item],
      isExpanded: false,
      element: stackWrapper,
    };
    activeStacks.set(item.app_id, stack);

    startCardTimer(item, primaryCard);

    // Clicking stack toggles expansion
    stackWrapper.addEventListener('click', (e) => {
      if ((e.target               ).closest('.card-close-btn') || (e.target               ).closest('.stack-clear-btn')) {
        return;
      }
      toggleStackExpansion(item.app_id);
    });
  } else {
    // Add item to existing stack
    stack.items.unshift(item);
    renderStack(stack);
  }

  updateStackDeckVisuals(stack);
}

// Coalesce notification update
function handleCoalesceNotification(item                  ) {
  const stack = activeStacks.get(item.app_id);
  if (stack) {
    stack.items[0] = item;
    renderStack(stack);
  } else {
    handleIncomingNotification(item);
  }
}

// Update Stack Deck Layers & Badges
function updateStackDeckVisuals(stack             ) {
  const count = stack.items.length;
  const layer1 = stack.element.querySelector('.stack-deck-layer-1')                      ;
  const layer2 = stack.element.querySelector('.stack-deck-layer-2')                      ;
  const clearBtn = stack.element.querySelector('.stack-clear-btn')                      ;

  if (layer1) layer1.style.display = count > 1 && !stack.isExpanded ? 'block' : 'none';
  if (layer2) layer2.style.display = count > 2 && !stack.isExpanded ? 'block' : 'none';
  if (clearBtn) clearBtn.style.display = count > 1 ? 'block' : 'none';

  // Update badge on top card
  const badge = stack.element.querySelector('.stack-badge')                      ;
  const metaRight = stack.element.querySelector('.card-meta-right');
  if (count > 1) {
    if (!badge && metaRight) {
      const newBadge = document.createElement('span');
      newBadge.className = 'stack-badge';
      newBadge.textContent = `+${count - 1} more`;
      metaRight.prepend(newBadge);
    } else if (badge) {
      badge.textContent = `+${count - 1} more`;
    }
  } else if (badge) {
    badge.remove();
  }
}

// Render stack according to expanded / collapsed state
function renderStack(stack             ) {
  // Remove existing cards
  const existingCards = stack.element.querySelectorAll('.notification-card');
  existingCards.forEach((c) => c.remove());

  if (stack.isExpanded) {
    stack.element.classList.add('expanded');
    // Fan out all cards in the stack
    stack.items.forEach((item, index) => {
      const card = createCardElement(item, index > 0);
      stack.element.appendChild(card);
      // Restart timer for top card or keep visible
      if (index === 0 && !timers.has(item.id)) {
        startCardTimer(item, card);
      }
    });
  } else {
    stack.element.classList.remove('expanded');
    // Only show top card
    const topItem = stack.items[0];
    const card = createCardElement(topItem, false);
    stack.element.appendChild(card);
    startCardTimer(topItem, card);
  }

  updateStackDeckVisuals(stack);
}

// Toggle expansion of an app stack
function toggleStackExpansion(app_id        ) {
  const stack = activeStacks.get(app_id);
  if (!stack || stack.items.length <= 1) return;

  stack.isExpanded = !stack.isExpanded;
  renderStack(stack);
}

// Dismiss single notification
function dismissNotification(id        , app_id        ) {
  const timerData = timers.get(id);
  if (timerData) {
    clearTimeout(timerData.timerId);
    timers.delete(id);
  }

  tauriInvoke('dismiss_native_notification', { id });

  const stack = activeStacks.get(app_id);
  if (!stack) return;

  stack.items = stack.items.filter((item) => item.id !== id);

  if (stack.items.length === 0) {
    stack.element.remove();
    activeStacks.delete(app_id);
  } else {
    renderStack(stack);
  }

  mouseInsideInteractiveCount = Math.max(0, mouseInsideInteractiveCount - 1);
  updateCursorEvents();
}

// Dismiss entire app stack
function dismissAppStack(app_id        ) {
  const stack = activeStacks.get(app_id);
  if (!stack) return;

  stack.items.forEach((item) => {
    const t = timers.get(item.id);
    if (t) {
      clearTimeout(t.timerId);
      timers.delete(item.id);
    }
  });

  tauriInvoke('dismiss_app_stack', { appId: app_id });

  stack.element.style.transition = 'transform 250ms var(--spring-easing), opacity 200ms ease';
  stack.element.style.transform = 'translateX(110%) scale(0.94)';
  stack.element.style.opacity = '0';

  setTimeout(() => {
    stack.element.remove();
    activeStacks.delete(app_id);
    mouseInsideInteractiveCount = Math.max(0, mouseInsideInteractiveCount - 1);
    updateCursorEvents();
  }, 230);
}

// History Drawer Functions
async function openHistoryDrawer() {
  isHistoryDrawerOpen = true;
  historyDrawer.classList.add('open');
  updateCursorEvents();
  await refreshHistoryList();
}

function closeHistoryDrawer() {
  isHistoryDrawerOpen = false;
  historyDrawer.classList.remove('open');
  updateCursorEvents();
}

function toggleHistoryDrawer() {
  if (isHistoryDrawerOpen) {
    closeHistoryDrawer();
  } else {
    openHistoryDrawer();
  }
}

async function refreshHistoryList(query         = '') {
  const history                     = (await tauriInvoke('get_notification_history')) || [];
  historyBadge.textContent = history.length.toString();

  const filtered = query.trim()
    ? history.filter(
        (h) =>
          h.title.toLowerCase().includes(query.toLowerCase()) ||
          h.body.toLowerCase().includes(query.toLowerCase()) ||
          h.app_name.toLowerCase().includes(query.toLowerCase())
      )
    : history;

  if (filtered.length === 0) {
    historyList.innerHTML = `
      <div class="drawer-empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" opacity="0.4">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
        </svg>
        <span>No notifications to display</span>
      </div>
    `;
    return;
  }

  historyList.innerHTML = filtered
    .map(
      (item) => `
    <div class="drawer-item">
      <div class="app-icon-wrapper" style="width: 28px; height: 28px; border-radius: 7px;">
        ${
          item.app_icon_base64
            ? `<img class="app-icon" src="${item.app_icon_base64}" alt="${escapeHtml(item.app_name)}" />`
            : getDefaultAppIconSvg()
        }
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <span style="font-size: 10.5px; font-weight: 600; color: var(--text-secondary);">${escapeHtml(item.app_name)}</span>
          <span style="font-size: 10px; color: var(--text-muted);">${formatTime(item.timestamp)}</span>
        </div>
        <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(item.title)}
        </div>
        <div style="font-size: 11.5px; color: var(--text-secondary); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${escapeHtml(item.body)}
        </div>
      </div>
    </div>
  `
    )
    .join('');
}

// HTML escape helper
function escapeHtml(str        )         {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Check for Software Updates via GitHub Releases
const CURRENT_APP_VERSION = 'v1.0.3';
const GITHUB_REPO_PATH = 'saivarshithm/smart-notify';

async function checkForUpdates(manualTrigger          = true) {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO_PATH}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) {
      if (manualTrigger) {
        handleIncomingNotification({
          id: Date.now(),
          app_id: 'com.smartnotify.updater',
          app_name: 'Smart Notify Updater',
          app_icon_base64: null,
          title: 'Update Check',
          body: 'Unable to check for updates right now. Please check your internet connection.',
          timestamp: Date.now(),
          time_formatted: 'now',
          is_urgent: false,
          is_coalesced: false,
          coalesce_count: 1,
          coalesced_messages: [],
        });
      }
      return;
    }

    const data = await res.json();
    const latestVersion = data.tag_name || data.name;
    const releaseUrl = data.html_url || `https://github.com/${GITHUB_REPO_PATH}/releases/latest`;

    if (latestVersion && latestVersion !== CURRENT_APP_VERSION) {
      handleIncomingNotification({
        id: Date.now(),
        app_id: 'com.smartnotify.updater',
        app_name: 'Smart Notify Updater',
        app_icon_base64: null,
        title: `Update Available: ${latestVersion}`,
        body: `A new version of Smart Notify is available (current: ${CURRENT_APP_VERSION}). Click this card to download.`,
        timestamp: Date.now(),
        time_formatted: 'now',
        is_urgent: true,
        is_coalesced: false,
        coalesce_count: 1,
        coalesced_messages: [],
        action_url: releaseUrl,
      });
    } else if (manualTrigger) {
      handleIncomingNotification({
        id: Date.now(),
        app_id: 'com.smartnotify.updater',
        app_name: 'Smart Notify Updater',
        app_icon_base64: null,
        title: "You're Up to Date!",
        body: `Smart Notify ${CURRENT_APP_VERSION} is currently the newest version available.`,
        timestamp: Date.now(),
        time_formatted: 'now',
        is_urgent: false,
        is_coalesced: false,
        coalesce_count: 1,
        coalesced_messages: [],
      });
    }
  } catch (err) {
    console.error('Update check failed:', err);
    if (manualTrigger) {
      handleIncomingNotification({
        id: Date.now(),
        app_id: 'com.smartnotify.updater',
        app_name: 'Smart Notify Updater',
        app_icon_base64: null,
        title: 'Update Check',
        body: 'Could not connect to GitHub. Please check your internet connection.',
        timestamp: Date.now(),
        time_formatted: 'now',
        is_urgent: false,
        is_coalesced: false,
        coalesce_count: 1,
        coalesced_messages: [],
      });
    }
  }
}

// Initialise listeners and UI wiring
function init() {
  // Register drawer elements for cursor hover interaction
  registerInteractive(historyDrawer);
  registerInteractive(permissionBanner);

  // Permission banner click
  permissionBanner.addEventListener('click', () => {
    tauriInvoke('open_notification_settings');
  });

  // Drawer buttons
  closeDrawerBtn.addEventListener('click', closeHistoryDrawer);
  clearHistoryBtn.addEventListener('click', async () => {
    await tauriInvoke('clear_notification_history');
    await refreshHistoryList();
  });

  sendTestBtn.addEventListener('click', () => {
    tauriInvoke('send_test_notification');
  });

  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', () => {
      checkForUpdates(true);
    });
  }

  focusToggleBtn.addEventListener('click', async () => {
    isFocusModeActive = (await tauriInvoke('toggle_smart_focus_mode')) || false;
    focusToggleBtn.style.color = isFocusModeActive ? '#f59e0b' : 'var(--text-secondary)';
    focusToggleBtn.title = isFocusModeActive ? 'Focus Mode Active (Paused 1 hr)' : 'Toggle Smart Focus Pause';
  });

  historySearch.addEventListener('input', (e) => {
    refreshHistoryList((e.target                    ).value);
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
      e.preventDefault();
      toggleHistoryDrawer();
    } else if (e.key === 'Escape') {
      if (isHistoryDrawerOpen) {
        closeHistoryDrawer();
      } else {
        // Collapse expanded stacks
        activeStacks.forEach((stack) => {
          if (stack.isExpanded) {
            toggleStackExpansion(stack.app_id);
          }
        });
      }
    }
  });

  // Tauri Event Listeners
  if (window.__TAURI__?.event?.listen) {
    window.__TAURI__.event.listen                  ('new-notification', (evt) => {
      handleIncomingNotification(evt.payload);
    });

    window.__TAURI__.event.listen                  ('coalesce-notification', (evt) => {
      handleCoalesceNotification(evt.payload);
    });

    window.__TAURI__.event.listen                       ('listener-status', (evt) => {
      if (evt.payload.status === 'denied') {
        permissionBanner.style.display = 'flex';
      } else {
        permissionBanner.style.display = 'none';
      }
    });

    window.__TAURI__.event.listen('toggle-history', () => {
      toggleHistoryDrawer();
    });

    window.__TAURI__.event.listen('check-for-updates', () => {
      checkForUpdates(true);
    });

    window.__TAURI__.event.listen         ('focus-mode-changed', (evt) => {
      isFocusModeActive = evt.payload;
      focusToggleBtn.style.color = isFocusModeActive ? '#f59e0b' : 'var(--text-secondary)';
    });
  }

  // Periodic relative timestamp update
  setInterval(() => {
    document.querySelectorAll('.notification-card').forEach((card) => {
      const id = Number((card               ).dataset.id);
      const stack = activeStacks.get((card               ).dataset.appId || '');
      if (stack) {
        const item = stack.items.find((i) => i.id === id);
        if (item) {
          const tsEl = card.querySelector('.timestamp');
          if (tsEl) tsEl.textContent = formatTime(item.timestamp);
        }
      }
    });
  }, 15000);

  // Recalculate position on window resize or scale change
  window.addEventListener('resize', () => {
    tauriInvoke('recalculate_window_position');
  });

  console.log('Smart Notify UI initialized successfully.');
}

window.addEventListener('DOMContentLoaded', init);
