#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
        use windows::Win32::System::Threading::CreateMutexA;
        use windows::core::s;

        let _mutex = CreateMutexA(None, true, s!("Global\\SmartNotifySingleInstanceMutex_v1"));
        if GetLastError() == ERROR_ALREADY_EXISTS {
            // An instance is already running! Exit silently to prevent duplicate tray icons or duplicate processes.
            return;
        }
    }

    smart_notify::run();
}
