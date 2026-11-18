use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationItem {
    pub id: u32,
    pub app_id: String,
    pub app_name: String,
    pub app_icon_base64: Option<String>,
    pub title: String,
    pub body: String,
    pub timestamp: i64,
    pub time_formatted: String,
    pub is_urgent: bool,
    pub is_coalesced: bool,
    pub coalesce_count: u32,
    pub coalesced_messages: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartRules {
    pub muted_apps: Vec<String>,
    pub urgent_keywords: Vec<String>,
    pub burst_window_ms: u64,
    pub burst_threshold: u32,
    pub normal_duration_ms: u64,
    pub urgent_duration_ms: u64,
    pub suppress_fullscreen: bool,
}

impl Default for SmartRules {
    fn default() -> Self {
        Self {
            muted_apps: vec![
                "Microsoft.Windows.ShellExperienceHost".to_string(),
                "Windows.SystemToast.Suggested".to_string(),
            ],
            urgent_keywords: vec![
                "otp".to_string(),
                "verification".to_string(),
                "verify".to_string(),
                "2fa".to_string(),
                "urgent".to_string(),
                "critical".to_string(),
                "build failed".to_string(),
                "alert".to_string(),
                "security code".to_string(),
                "password reset".to_string(),
            ],
            burst_window_ms: 4000,
            burst_threshold: 3,
            normal_duration_ms: 5500,
            urgent_duration_ms: 9000,
            suppress_fullscreen: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestNotificationPayload {
    pub app_id: Option<String>,
    pub app_name: Option<String>,
    pub title: Option<String>,
    pub body: Option<String>,
    pub is_urgent: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListenerStatusPayload {
    pub status: String, // "allowed", "denied", "unsupported", "error"
    pub message: String,
}
