<#
.SYNOPSIS
    Unregisters the Smart Notify Sparse Package identity from Windows.
#>

$ExistingPkg = Get-AppxPackage -Name "SmartNotify" -ErrorAction SilentlyContinue
if ($ExistingPkg) {
    Write-Host "Unregistering SmartNotify package: $($ExistingPkg.PackageFullName)..." -ForegroundColor Yellow
    Remove-AppxPackage -Package $ExistingPkg.PackageFullName
    Write-Host "[✓] Smart Notify package identity successfully removed." -ForegroundColor Green
} else {
    Write-Host "Smart Notify package is not currently registered." -ForegroundColor Cyan
}
