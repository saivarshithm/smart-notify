@echo off
setlocal EnableDelayedExpansion
title Smart Notify - Easy Installer

echo ==========================================================
echo        Smart Notify for Windows 11 - Easy Installer
echo ==========================================================
echo.

:: 1. Check for Admin rights and self-elevate if needed
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Requesting Administrator privileges to register package identity...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

:: 2. Resolve paths
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

set "EXE_PATH=%APP_DIR%\smart-notify.exe"
if not exist "%EXE_PATH%" (
    set "EXE_PATH=%APP_DIR%\src-tauri\target\release\smart-notify.exe"
)

if not exist "%EXE_PATH%" (
    echo [!] Error: smart-notify.exe not found in "%APP_DIR%".
    echo Please make sure smart-notify.exe is in this folder or build it with cargo.
    echo.
    pause
    exit /b 1
)

echo [✓] Located application binary: "%EXE_PATH%"
echo.

:: 3. Run Windows Package Identity Registration (Sparse MSIX)
echo [*] Registering Windows 11 Notification Identity...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%APP_DIR%\sparse-package\register-identity.ps1' -BinaryDir '%APP_DIR%'"

if %errorlevel% neq 0 (
    echo [!] Sparse package registration encountered an issue.
    echo Smart Notify will still run, but WinRT notifications may require manual identity registration.
    echo.
)

:: 4. Create Desktop & Start Menu Shortcuts
echo [*] Creating shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; " ^
  "$DesktopShortcut = $WshShell.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Smart Notify.lnk'); " ^
  "$DesktopShortcut.TargetPath = '%EXE_PATH%'; " ^
  "$DesktopShortcut.WorkingDirectory = '%APP_DIR%'; " ^
  "$DesktopShortcut.IconLocation = '%EXE_PATH%,0'; " ^
  "$DesktopShortcut.Save(); " ^
  "$ProgramsShortcut = $WshShell.CreateShortcut([Environment]::GetFolderPath('Programs') + '\Smart Notify.lnk'); " ^
  "$ProgramsShortcut.TargetPath = '%EXE_PATH%'; " ^
  "$ProgramsShortcut.WorkingDirectory = '%APP_DIR%'; " ^
  "$ProgramsShortcut.IconLocation = '%EXE_PATH%,0'; " ^
  "$ProgramsShortcut.Save();"

:: 5. Add to Windows Startup (User choice)
echo.
set /p AUTOSTART="Would you like Smart Notify to start automatically with Windows? (Y/N): "
if /i "%AUTOSTART%"=="Y" (
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "SmartNotify" /t REG_SZ /d "\"%EXE_PATH%\"" /f >nul 2>&1
    echo [✓] Added to Windows Startup.
)

:: 6. Launch Application
echo.
echo ==========================================================
echo  [✓] Installation complete! Launching Smart Notify...
echo ==========================================================
start "" "%EXE_PATH%"

timeout /t 3 >nul
exit /b 0
