pub mod models;
pub mod rules;
pub mod smart_engine;
pub mod tray;
pub mod winrt_listener;

use models::{NotificationItem, TestNotificationPayload};
use rules::RulesManager;
use smart_engine::{ProcessResult, SmartEngine};
use std::sync::Arc;
use tauri::{
    command, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition,
    Position, Size, WebviewWindow,
};
use winrt_listener::{start_winrt_listener, WinRtListenerHandle};

pub struct AppState {
    pub smart_engine: Arc<SmartEngine>,
    pub listener_handle: Arc<WinRtListenerHandle>,
}

#[command]
fn dismiss_native_notification(state: tauri::State<AppState>, id: u32) {
    state.listener_handle.remove_notification(id);
}

#[command]
fn dismiss_app_stack(state: tauri::State<AppState>, app_id: String) {
    // If WinRT IDs are associated, remove them
    let history = state.smart_engine.get_history();
    for item in history {
        if item.app_id == app_id {
            state.listener_handle.remove_notification(item.id);
        }
    }
}

#[command]
fn set_ignore_cursor_events(window: WebviewWindow, ignore: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())
}

#[command]
fn get_notification_history(state: tauri::State<AppState>) -> Vec<NotificationItem> {
    state.smart_engine.get_history()
}

#[command]
fn clear_notification_history(state: tauri::State<AppState>) {
    state.smart_engine.clear_history();
}

#[command]
fn toggle_smart_focus_mode(state: tauri::State<AppState>) -> bool {
    let (active, _) = state.smart_engine.toggle_focus_mode();
    active
}

#[command]
fn open_notification_settings() {
    #[cfg(windows)]
    {
        use std::process::Command;
        let _ = Command::new("cmd")
            .args(["/c", "start", "ms-settings:privacy-notifications"])
            .spawn();
    }
}

#[command]
fn open_rules_file(state: tauri::State<AppState>) {
    let path = state.smart_engine.rules_manager.get_rules_path();
    #[cfg(windows)]
    {
        use std::process::Command;
        let _ = Command::new("notepad.exe").arg(path).spawn();
    }
}

#[command]
fn send_test_notification(
    app_handle: AppHandle,
    state: tauri::State<AppState>,
    payload: Option<TestNotificationPayload>,
) -> NotificationItem {
    let test_id = SmartEngine::next_synthetic_id();
    let p = payload.unwrap_or(TestNotificationPayload {
        app_id: None,
        app_name: None,
        title: None,
        body: None,
        is_urgent: None,
    });

    let app_id = p.app_id.unwrap_or_else(|| "com.github.desktop".to_string());
    let app_name = p.app_name.unwrap_or_else(|| "GitHub".to_string());
    let title = p.title.unwrap_or_else(|| "PR #42 CI Build Succeeded".to_string());
    let body = p.body.unwrap_or_else(|| "All 18 tests passed. Verification successful for smart-notify release.".to_string());

    let result = state.smart_engine.process_incoming(
        test_id,
        app_id,
        app_name,
        None,
        title,
        body,
        None,
    );

    match result {
        ProcessResult::ShowBanner(ref item) => {
            let _ = app_handle.emit("new-notification", item);
            item.clone()
        }
        ProcessResult::CoalesceUpdate(ref item) => {
            let _ = app_handle.emit("coalesce-notification", item);
            item.clone()
        }
        ProcessResult::SilentlyArchived(ref item) => item.clone(),
    }
}

#[command]
fn recalculate_window_position(window: WebviewWindow) -> Result<(), String> {
    anchor_overlay_window(&window);
    Ok(())
}

fn anchor_overlay_window(window: &WebviewWindow) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let screen_size = monitor.size();
        let scale_factor = monitor.scale_factor();

        let width_logical = 400.0;
        let height_logical = 680.0;
        let margin_right_logical = 16.0;
        let margin_top_logical = 16.0;

        let width_phys = (width_logical * scale_factor) as i32;
        let _height_phys = (height_logical * scale_factor) as i32;
        let x_phys = (screen_size.width as i32) - width_phys - ((margin_right_logical * scale_factor) as i32);
        let y_phys = (margin_top_logical * scale_factor) as i32;

        let _ = window.set_size(Size::Logical(LogicalSize::new(width_logical, height_logical)));
        let _ = window.set_position(Position::Physical(PhysicalPosition::new(x_phys, y_phys)));
    }
}

pub fn run() {
    let rules_manager = Arc::new(RulesManager::new());
    let smart_engine = Arc::new(SmartEngine::new(rules_manager.clone()));
    let listener_handle = Arc::new(WinRtListenerHandle::new());

    let state = AppState {
        smart_engine: smart_engine.clone(),
        listener_handle: listener_handle.clone(),
    };

    tauri::Builder::default()
        .manage(state)
        .setup(move |app| {
            let main_window = app.get_webview_window("main").expect("Main window not found");

            // Anchor window to top-right of primary display
            anchor_overlay_window(&main_window);

            // Initially set click-through so only notification cards intercept clicks
            let _ = main_window.set_ignore_cursor_events(true);

            // Setup System Tray
            let _ = tray::setup_tray(app.handle(), smart_engine.clone());

            // Start WinRT Listener on dedicated MTA thread
            start_winrt_listener(app.handle().clone(), smart_engine.clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dismiss_native_notification,
            dismiss_app_stack,
            set_ignore_cursor_events,
            get_notification_history,
            clear_notification_history,
            toggle_smart_focus_mode,
            open_notification_settings,
            open_rules_file,
            send_test_notification,
            recalculate_window_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Smart Notify application");
}
