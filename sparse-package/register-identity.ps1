<#
.SYNOPSIS
    Registers Windows Package Identity (Sparse MSIX) for Smart Notify to enable UserNotificationListener.
.DESCRIPTION
    Builds a sparse MSIX package containing AppxManifest.xml, creates/trusts a local dev certificate,
    signs the package, and registers it with Add-AppxPackage -ExternalLocation.
#>

[CmdletBinding()]
param (
    [string]$BinaryDir = ""
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Smart Notify - Windows Sparse MSIX Identity Setup     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Resolve Binary Directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($BinaryDir)) {
    $PotentialDirs = @(
        (Join-Path $ScriptDir "..\src-tauri\target\release"),
        (Join-Path $ScriptDir "..\src-tauri\target\debug"),
        (Join-Path $ScriptDir "..\target\release"),
        (Join-Path $ScriptDir "..\target\debug"),
        $ScriptDir
    )
    foreach ($dir in $PotentialDirs) {
        $exePath = Join-Path $dir "smart-notify.exe"
        if (Test-Path $exePath) {
            $BinaryDir = (Resolve-Path $dir).Path
            break
        }
    }
}

if ([string]::IsNullOrWhiteSpace($BinaryDir) -or (-not (Test-Path (Join-Path $BinaryDir "smart-notify.exe")))) {
    Write-Warning "Could not automatically locate 'smart-notify.exe'."
    Write-Host "Using default target path: ..\src-tauri\target\release" -ForegroundColor Yellow
    $BinaryDir = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir "..\src-tauri\target\release"))
} else {
    Write-Host "[✓] Found executable at: $BinaryDir\smart-notify.exe" -ForegroundColor Green
}

# 2. Locate Windows SDK Tools (makeappx.exe and signtool.exe)
Write-Host "[*] Locating Windows SDK packaging tools..." -ForegroundColor Yellow

function Find-SdkTool ([string]$ToolName) {
    # Check PATH
    $cmd = Get-Command $ToolName -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    # Check Windows Kits directories
    $SearchRoots = @(
        "C:\Program Files (x86)\Windows Kits\10\bin",
        "C:\Program Files\Windows Kits\10\bin"
    )
    foreach ($root in $SearchRoots) {
        if (Test-Path $root) {
            $matches = Get-ChildItem -Path $root -Filter $ToolName -Recurse -Depth 4 -ErrorAction SilentlyContinue |
                       Where-Object { $_.FullName -match 'x64' } |
                       Sort-Object FullName -Descending
            if ($matches.Count -gt 0) {
                return $matches[0].FullName
            }
        }
    }
    return $null
}

$MakeAppx = Find-SdkTool "makeappx.exe"
$SignTool = Find-SdkTool "signtool.exe"

if (-not $MakeAppx -or -not $SignTool) {
    Write-Error @"
Windows 10/11 SDK tools (makeappx.exe and signtool.exe) were not found in standard paths.
Please ensure the Windows SDK is installed with 'Windows SDK Signing Tools' and 'App Certification Kit'.
You can install it via Visual Studio Installer or:
https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
"@
}

Write-Host "[✓] makeappx.exe: $MakeAppx" -ForegroundColor Green
Write-Host "[✓] signtool.exe: $SignTool" -ForegroundColor Green

# 3. Create & Trust Local Development Certificate
$CertSubject = "CN=SmartNotifyDev"
$Cert = Get-ChildItem -Path "Cert:\CurrentUser\My" -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Subject -eq $CertSubject } | Select-Object -First 1

if (-not $Cert) {
    Write-Host "[*] Generating self-signed developer certificate for Smart Notify..." -ForegroundColor Yellow
    $Cert = New-SelfSignedCertificate -Type Custom `
        -Subject $CertSubject `
        -KeyUsage DigitalSignature `
        -FriendlyName "Smart Notify Dev Cert" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")
    
    $CerPath = Join-Path $ScriptDir "SmartNotifyDev.cer"
    Export-Certificate -Cert $Cert -FilePath $CerPath | Out-Null

    Write-Host "[*] Installing certificate to CurrentUser\Root (Trusted Root)..." -ForegroundColor Yellow
    Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
    Write-Host "[✓] Development certificate created and trusted." -ForegroundColor Green
} else {
    Write-Host "[✓] Using existing dev certificate ($CertSubject)" -ForegroundColor Green
}

# 4. Pack Sparse MSIX Package
$MsixPath = Join-Path $ScriptDir "SmartNotify.msix"
if (Test-Path $MsixPath) { Remove-Item $MsixPath -Force }

Write-Host "[*] Packaging sparse MSIX ($MsixPath)..." -ForegroundColor Yellow
& $MakeAppx pack /d $ScriptDir /p $MsixPath /nv
if ($LASTEXITCODE -ne 0) {
    throw "makeappx.exe failed with exit code $LASTEXITCODE"
}
Write-Host "[✓] Sparse package created." -ForegroundColor Green

# 5. Sign Package
Write-Host "[*] Signing MSIX package..." -ForegroundColor Yellow
& $SignTool sign /fd SHA256 /a /s My /n "SmartNotifyDev" $MsixPath
if ($LASTEXITCODE -ne 0) {
    throw "signtool.exe signing failed with exit code $LASTEXITCODE"
}
Write-Host "[✓] Package signed successfully." -ForegroundColor Green

# 6. Register Sparse Package with External Location
Write-Host "[*] Registering package identity with external location..." -ForegroundColor Yellow
Write-Host "    Target Directory: $BinaryDir" -ForegroundColor Gray

# If previous version is registered, remove it first
$ExistingPkg = Get-AppxPackage -Name "SmartNotify" -ErrorAction SilentlyContinue
if ($ExistingPkg) {
    Write-Host "[*] Updating existing package registration..." -ForegroundColor Gray
    Remove-AppxPackage -Package $ExistingPkg.PackageFullName -ErrorAction SilentlyContinue
}

Add-AppxPackage -Path $MsixPath -ExternalLocation $BinaryDir

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " [✓] SUCCESS! Smart Notify package identity registered!   " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "You can now run 'smart-notify.exe' with full WinRT UserNotificationListener privileges." -ForegroundColor Cyan
Write-Host ""
