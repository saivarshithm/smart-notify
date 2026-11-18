@echo off
setlocal EnableDelayedExpansion
title Smart Notify - Uninstaller

echo ==========================================================
echo        Smart Notify for Windows 11 - Uninstaller
echo ==========================================================
echo.

:: 1. Self-elevate
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Requesting Administrator privileges to unregister package identity...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

:: 2. Terminate running instance
echo [*] Closing running Smart Notify instances...
taskkill /f /im smart-notify.exe >nul 2>&1

:: 3. Remove Startup Entry
echo [*] Removing Windows Startup entry...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "SmartNotify" /f >nul 2>&1

:: 4. Remove Shortcuts
echo [*] Removing shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Remove-Item -Path ([Environment]::GetFolderPath('Desktop') + '\Smart Notify.lnk') -Force -ErrorAction SilentlyContinue; " ^
  "Remove-Item -Path ([Environment]::GetFolderPath('Programs') + '\Smart Notify.lnk') -Force -ErrorAction SilentlyContinue;"

:: 5. Unregister Sparse MSIX Package
echo [*] Unregistering Windows Package Identity...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%APP_DIR%\sparse-package\unregister-identity.ps1'"

echo.
echo ==========================================================
echo  [✓] Smart Notify has been cleanly uninstalled.
echo ==========================================================
pause
exit /b 0
