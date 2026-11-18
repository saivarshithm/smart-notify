use crate::models::TestNotificationPayload;
use crate::smart_engine::SmartEngine;
use std::sync::Arc;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Runtime};

pub fn setup_tray<R: Runtime>(
    app: &AppHandle<R>,
    smart_engine: Arc<SmartEngine>,
) -> Result<(), Box<dyn std::error::Error>> {
    let toggle_history_item =
        MenuItemBuilder::with_id("toggle_history", "Toggle History Drawer (Alt+Shift+N)").build(app)?;
    let send_test_item =
        MenuItemBuilder::with_id("send_test", "Send Test Notification").build(app)?;
    let toggle_focus_item =
        MenuItemBuilder::with_id("toggle_focus", "Smart Focus Pause (1 hr)").build(app)?;
    let edit_rules_item =
        MenuItemBuilder::with_id("edit_rules", "Edit smart-rules.json").build(app)?;
    let check_updates_item =
        MenuItemBuilder::with_id("check_updates", "Check for Updates...").build(app)?;
    let open_settings_item =
        MenuItemBuilder::with_id("open_settings", "Open Windows Notification Settings").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit Smart Notify").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &toggle_history_item,
            &send_test_item,
            &toggle_focus_item,
            &edit_rules_item,
            &check_updates_item,
            &open_settings_item,
            &separator,
            &quit_item,
        ])
        .build()?;

    let engine_clone = smart_engine.clone();

    let _tray = TrayIconBuilder::with_id("main-tray")
        .tooltip("Smart Notify")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app_handle, event| {
            let id = event.id().as_ref();
            match id {
                "toggle_history" => {
                    let _ = app_handle.emit("toggle-history", ());
                }
                "send_test" => {
                    let test_id = SmartEngine::next_synthetic_id();
                    let result = engine_clone.process_incoming(
                        test_id,
                        "com.demo.slack".to_string(),
                        "Slack".to_string(),
                        None,
                        "Sarah Jenkins (Project Apollo)".to_string(),
                        "Can you review the latest deployment logs? Build verification passed!".to_string(),
                        None,
                    );
                    match result {
                        crate::smart_engine::ProcessResult::ShowBanner(item) => {
                            let _ = app_handle.emit("new-notification", item);
                        }
                        crate::smart_engine::ProcessResult::CoalesceUpdate(item) => {
                            let _ = app_handle.emit("coalesce-notification", item);
                        }
                        _ => {}
                    }
                }
                "toggle_focus" => {
                    let (active, _) = engine_clone.toggle_focus_mode();
                    let _ = app_handle.emit("focus-mode-changed", active);
                }
                "edit_rules" => {
                    let path = engine_clone.rules_manager.get_rules_path();
                    #[cfg(windows)]
                    {
                        use std::process::Command;
                        let _ = Command::new("notepad.exe").arg(path).spawn();
                    }
                }
                "check_updates" => {
                    let _ = app_handle.emit("check-for-updates", ());
                }
                "open_settings" => {
                    #[cfg(windows)]
                    {
                        use std::process::Command;
                        let _ = Command::new("cmd")
                            .args(["/c", "start", "ms-settings:privacy-notifications"])
                            .spawn();
                    }
                }
                "quit" => {
                    app_handle.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = app.emit("toggle-history", ());
            }
        })
        .build(app)?;

    Ok(())
}
