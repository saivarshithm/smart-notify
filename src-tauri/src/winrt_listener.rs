use crate::models::ListenerStatusPayload;
use crate::smart_engine::{ProcessResult, SmartEngine};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use windows::{
    core::HSTRING,
    Foundation::{Size, TypedEventHandler},
    Storage::Streams::DataReader,
    UI::Notifications::KnownNotificationBindings,
    UI::Notifications::Management::{
        NotificationNotificationChangedKind, UserNotificationChangedEventArgs,
        UserNotificationListener, UserNotificationListenerAccessStatus,
    },
    Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED},
};

pub struct WinRtListenerHandle {
    #[cfg(windows)]
    listener: Option<UserNotificationListener>,
}

impl WinRtListenerHandle {
    pub fn new() -> Self {
        #[cfg(windows)]
        {
            let listener = UserNotificationListener::Current().ok();
            Self { listener }
        }
        #[cfg(not(windows))]
        Self {}
    }

    pub fn remove_notification(&self, id: u32) {
        #[cfg(windows)]
        {
            if let Some(ref listener) = self.listener {
                let _ = listener.RemoveNotification(id);
            }
        }
    }
}

pub fn start_winrt_listener(app_handle: AppHandle, smart_engine: Arc<SmartEngine>) {
    thread::spawn(move || {
        #[cfg(windows)]
        unsafe {
            // Initialize MTA COM
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            let listener = match UserNotificationListener::Current() {
                Ok(l) => l,
                Err(e) => {
                    let _ = app_handle.emit(
                        "listener-status",
                        ListenerStatusPayload {
                            status: "unsupported".to_string(),
                            message: format!("WinRT UserNotificationListener unavailable: {:?}", e),
                        },
                    );
                    return;
                }
            };

            // Request access
            let access_status = match listener.RequestAccessAsync() {
                Ok(async_op) => match async_op.get() {
                    Ok(status) => status,
                    Err(e) => {
                        let _ = app_handle.emit(
                            "listener-status",
                            ListenerStatusPayload {
                                status: "denied".to_string(),
                                message: format!("RequestAccessAsync failed: {:?}", e),
                            },
                        );
                        return;
                    }
                },
                Err(e) => {
                    let _ = app_handle.emit(
                        "listener-status",
                        ListenerStatusPayload {
                            status: "denied".to_string(),
                            message: format!("RequestAccessAsync call error: {:?}", e),
                        },
                    );
                    return;
                }
            };

            if access_status != UserNotificationListenerAccessStatus::Allowed {
                let _ = app_handle.emit(
                    "listener-status",
                    ListenerStatusPayload {
                        status: "denied".to_string(),
                        message: "Windows notification access denied. Click to open Settings -> Privacy -> Notifications.".to_string(),
                    },
                );
                return;
            } else {
                let _ = app_handle.emit(
                    "listener-status",
                    ListenerStatusPayload {
                        status: "allowed".to_string(),
                        message: "Smart Notify successfully listening for Windows 11 notifications.".to_string(),
                    },
                );
            }

            // Hook NotificationChanged event
            let listener_for_event = listener.clone();
            let app_handle_for_event = app_handle.clone();
            let engine_for_event = smart_engine.clone();

            let handler = TypedEventHandler::new(
                move |_sender: &Option<UserNotificationListener>,
                      args: &Option<UserNotificationChangedEventArgs>| {
                    if let Some(args) = args {
                        if let Ok(kind) = args.ChangeKind() {
                            if kind == NotificationNotificationChangedKind::Added {
                                if let Ok(notif_id) = args.UserNotificationId() {
                                    if let Ok(raw_notif) = listener_for_event.GetNotification(notif_id) {
                                        process_winrt_notification(
                                            &app_handle_for_event,
                                            &engine_for_event,
                                            notif_id,
                                            &raw_notif,
                                        );
                                    }
                                }
                            }
                        }
                    }
                    Ok(())
                },
            );

            if let Err(e) = listener.NotificationChanged(&handler) {
                let _ = app_handle.emit(
                    "listener-status",
                    ListenerStatusPayload {
                        status: "error".to_string(),
                        message: format!("Failed to register NotificationChanged event: {:?}", e),
                    },
                );
            }

            // Keep listener thread alive
            loop {
                thread::park();
            }
        }

        #[cfg(not(windows))]
        {
            let _ = app_handle.emit(
                "listener-status",
                ListenerStatusPayload {
                    status: "unsupported".to_string(),
                    message: "WinRT notifications only supported on Windows 10/11.".to_string(),
                },
            );
        }
    });
}

#[cfg(windows)]
fn process_winrt_notification(
    app_handle: &AppHandle,
    engine: &Arc<SmartEngine>,
    id: u32,
    raw_notif: &windows::UI::Notifications::UserNotification,
) {
    let mut app_id = "Windows.App".to_string();
    let mut app_name = "Application".to_string();
    let mut icon_base64: Option<String> = None;
    let mut title = String::new();
    let mut body = String::new();

    // 1. App Info
    if let Ok(app_info) = raw_notif.AppInfo() {
        if let Ok(aumid) = app_info.AppUserModelId() {
            app_id = aumid.to_string();
        }
        if let Ok(display_info) = app_info.DisplayInfo() {
            if let Ok(name) = display_info.DisplayName() {
                app_name = name.to_string();
            }

            // 2. Logo extraction
            if let Ok(logo_stream_ref) = display_info.GetLogo(Size {
                Width: 64.0,
                Height: 64.0,
            }) {
                if let Ok(stream_op) = logo_stream_ref.OpenReadAsync() {
                    if let Ok(random_stream) = stream_op.get() {
                        if let Ok(size) = random_stream.Size() {
                            if size > 0 && size < 5 * 1024 * 1024 {
                                if let Ok(reader) = DataReader::CreateDataReader(&random_stream) {
                                    if let Ok(load_op) = reader.LoadAsync(size as u32) {
                                        if load_op.get().is_ok() {
                                            let mut buffer = vec![0u8; size as usize];
                                            if reader.ReadBytes(&mut buffer).is_ok() {
                                                let b64 = BASE64_STANDARD.encode(&buffer);
                                                icon_base64 = Some(format!("data:image/png;base64,{}", b64));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Extract text elements from ToastGeneric binding
    if let Ok(notif) = raw_notif.Notification() {
        if let Ok(visual) = notif.Visual() {
            if let Ok(toast_generic_hstring) = KnownNotificationBindings::ToastGeneric() {
                if let Ok(binding) = visual.GetBinding(&toast_generic_hstring) {
                    if let Ok(text_elements) = binding.GetTextElements() {
                        let count = text_elements.Size().unwrap_or(0);
                        let mut body_lines = Vec::new();

                        for i in 0..count {
                            if let Ok(element) = text_elements.GetAt(i) {
                                if let Ok(text) = element.Text() {
                                    let s = text.to_string();
                                    if i == 0 {
                                        title = s;
                                    } else if !s.trim().is_empty() {
                                        body_lines.push(s);
                                    }
                                }
                            }
                        }

                        body = body_lines.join("\n");
                    }
                }
            }
        }
    }

    if title.trim().is_empty() {
        title = app_name.clone();
    }

    let timestamp = Utc::now().timestamp_millis();

    let result = engine.process_incoming(
        id,
        app_id,
        app_name,
        icon_base64,
        title,
        body,
        Some(timestamp),
    );

    match result {
        ProcessResult::ShowBanner(item) => {
            let _ = app_handle.emit("new-notification", item);
        }
        ProcessResult::CoalesceUpdate(item) => {
            let _ = app_handle.emit("coalesce-notification", item);
        }
        ProcessResult::SilentlyArchived(_) => {
            // Saved to history silently
        }
    }
}
