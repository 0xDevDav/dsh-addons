# Install every package of this repository into the local DSH Web profile and leave a
# DavCode AGENT shortcut on the Desktop.
#
#   pwsh -File install/install.ps1 [-Version 0.1.6-alpha.1] [-NoShortcut]
#   (or: powershell -ExecutionPolicy Bypass -File ...)
#
# Requires: the `dsh` CLI and pnpm on PATH. Set DSH_CMD to override the command.
param(
  [string]$Version = '0.1.6-alpha.1',
  [switch]$NoShortcut
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dsh = if ($env:DSH_CMD) { $env:DSH_CMD } else { 'dsh' }
$harnessHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }

foreach ($pack in @('dsh-locale-it', 'dsh-session-cost', 'dsh-brand-davcode')) {
  $path = Join-Path $root "packages/$pack"
  Write-Host "installing $pack from $path"
  & $dsh plugin --profile web add $path
  if ($LASTEXITCODE -ne 0) { throw "dsh plugin add failed for $pack (exit $LASTEXITCODE)" }
}

# The Italian locale ships as a registered language; the durable preference is a
# user setting, so it is only seeded when the document has no locale section.
$settings = Join-Path $harnessHome 'settings.yaml'
if (Test-Path $settings) {
  if (-not (Select-String -Path $settings -Pattern '^locale:' -Quiet)) {
    Add-Content -Path $settings -Value "locale:`n  preference: it"
    Write-Host "seeded locale.preference: it in $settings"
  } else {
    Write-Host "settings.yaml already has a locale section; leaving it alone"
  }
} else {
  Write-Host "no settings.yaml yet: pick Italiano in Settings > Generale > Lingua after the first start"
}

if (-not $NoShortcut) {
  Write-Host ""
  Write-Host "creating the Desktop shortcut"
  & (Join-Path $PSScriptRoot 'shortcut.ps1') -Version $Version
}

Write-Host ""
Write-Host "done. Restart the Web surface (stop and relaunch dsh web), then reload the page."
