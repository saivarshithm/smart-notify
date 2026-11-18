use crate::models::{NotificationItem, SmartRules};
use crate::rules::RulesManager;
use chrono::Utc;
use parking_lot::RwLock;
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[cfg(windows)]
use windows::Win32::UI::Shell::{
    SHQueryUserNotificationState, QUERY_USER_NOTIFICATION_STATE, QUNS_BUSY,
    QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
};

static SYNTHETIC_ID_COUNTER: AtomicU32 = AtomicU32::new(100_000);

pub struct SmartEngine {
    pub rules_manager: Arc<RulesManager>,
    history: Arc<RwLock<VecDeque<NotificationItem>>>,
    // Tracks recent timestamps per app_id for burst detection: app_id -> list of Instants
    app_burst_tracker: Arc<RwLock<HashMap<String, Vec<Instant>>>>,
    // Tracks coalesced message buffers per app_id
    coalesced_buffers: Arc<RwLock<HashMap<String, Vec<String>>>>,
    // Smart focus pause end time
    focus_mode_until: Arc<RwLock<Option<Instant>>>,
}

pub enum ProcessResult {
    /// Show full banner on screen
    ShowBanner(NotificationItem),
    /// Coalesce with an already active banner on screen
    CoalesceUpdate(NotificationItem),
    /// Silently saved to history (muted, fullscreen, or focus mode)
    SilentlyArchived(NotificationItem),
}

impl SmartEngine {
    pub fn new(rules_manager: Arc<RulesManager>) -> Self {
        Self {
            rules_manager,
            history: Arc::new(RwLock::new(VecDeque::with_capacity(50))),
            app_burst_tracker: Arc::new(RwLock::new(HashMap::new())),
            coalesced_buffers: Arc::new(RwLock::new(HashMap::new())),
            focus_mode_until: Arc::new(RwLock::new(None)),
        }
    }

    pub fn next_synthetic_id() -> u32 {
        SYNTHETIC_ID_COUNTER.fetch_add(1, Ordering::SeqCst)
    }

    pub fn is_in_fullscreen_or_presentation(&self) -> bool {
        #[cfg(windows)]
        unsafe {
            let mut state: QUERY_USER_NOTIFICATION_STATE = QUERY_USER_NOTIFICATION_STATE(0);
            if SHQueryUserNotificationState(&mut state).is_ok() {
                matches!(
                    state,
                    QUNS_BUSY | QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE
                )
            } else {
                false
            }
        }
        #[cfg(not(windows))]
        false
    }

    pub fn toggle_focus_mode(&self) -> (bool, Option<u64>) {
        let mut lock = self.focus_mode_until.write();
        let now = Instant::now();
        if let Some(until) = *lock {
            if until > now {
                *lock = None;
                return (false, None);
            }
        }
        // Set focus mode for 1 hour
        let new_until = now + Duration::from_secs(3600);
        *lock = Some(new_until);
        (true, Some(3600))
    }

    pub fn is_focus_mode_active(&self) -> bool {
        let lock = self.focus_mode_until.read();
        if let Some(until) = *lock {
            until > Instant::now()
        } else {
            false
        }
    }

    pub fn process_incoming(
        &self,
        id: u32,
        app_id: String,
        app_name: String,
        app_icon_base64: Option<String>,
        title: String,
        body: String,
        raw_timestamp: Option<i64>,
    ) -> ProcessResult {
        let rules = self.rules_manager.get_rules();
        let timestamp = raw_timestamp.unwrap_or_else(|| Utc::now().timestamp_millis());
        let full_text = format!("{} {}", title, body);

        // 1. Keyword priority determination
        let is_urgent = self.rules_manager.contains_urgent_keyword(&full_text);

        // 2. Mute rule check
        let is_muted = self.rules_manager.is_app_muted(&app_id, &app_name);

        // 3. Fullscreen & Focus Mode checks (urgent bypasses both)
        let is_fullscreen = rules.suppress_fullscreen && self.is_in_fullscreen_or_presentation();
        let is_focus = self.is_focus_mode_active();

        let mut item = NotificationItem {
            id,
            app_id: app_id.clone(),
            app_name: app_name.clone(),
            app_icon_base64,
            title: title.clone(),
            body: body.clone(),
            timestamp,
            time_formatted: "now".to_string(),
            is_urgent,
            is_coalesced: false,
            coalesce_count: 1,
            coalesced_messages: vec![body.clone()],
        };

        // If muted or (fullscreen/focus and not urgent), silently save to history
        if is_muted || (!is_urgent && (is_fullscreen || is_focus)) {
            self.add_to_history(item.clone());
            return ProcessResult::SilentlyArchived(item);
        }

        // 4. Burst Coalescing & Rate Limiting
        let now = Instant::now();
        let burst_window = Duration::from_millis(rules.burst_window_ms);
        let burst_threshold = rules.burst_threshold;

        let mut tracker = self.app_burst_tracker.write();
        let timestamps = tracker.entry(app_id.clone()).or_insert_with(Vec::new);

        // Clean out timestamps older than burst window
        timestamps.retain(|&t| now.duration_since(t) <= burst_window);
        timestamps.push(now);

        let count = timestamps.len() as u32;

        if count >= burst_threshold {
            // Coalesce!
            let mut buffers = self.coalesced_buffers.write();
            let msg_list = buffers.entry(app_id.clone()).or_insert_with(Vec::new);
            msg_list.push(body.clone());

            item.is_coalesced = true;
            item.coalesce_count = count;
            item.coalesced_messages = msg_list.clone();
            item.title = format!("{} ({} new alerts)", app_name, count);
            item.body = format!("{} recent notifications coalesced", count);

            self.add_to_history(item.clone());
            return ProcessResult::CoalesceUpdate(item);
        } else {
            // Clear coalesced buffer for this app if not bursting
            let mut buffers = self.coalesced_buffers.write();
            buffers.insert(app_id.clone(), vec![body.clone()]);
        }

        self.add_to_history(item.clone());
        ProcessResult::ShowBanner(item)
    }

    fn add_to_history(&self, item: NotificationItem) {
        let mut hist = self.history.write();
        if hist.len() >= 50 {
            hist.pop_back();
        }
        hist.push_front(item);
    }

    pub fn get_history(&self) -> Vec<NotificationItem> {
        let hist = self.history.read();
        hist.iter().cloned().collect()
    }

    pub fn clear_history(&self) {
        let mut hist = self.history.write();
        hist.clear();
        let mut tracker = self.app_burst_tracker.write();
        tracker.clear();
        let mut buffers = self.coalesced_buffers.write();
        buffers.clear();
    }
}
