# Put the DavCode AGENT launcher where a shortcut can point at it, and (re)create the
# Desktop shortcut with the brand's own icon.
#
#   pwsh -File install/shortcut.ps1 [-Version 0.1.6-alpha.1] [-Name 'DavCode AGENT']
#
# Re-running it is the way to refresh the icon: Explorer caches icons per path, and a
# rewritten .lnk plus a shell icon-cache nudge is what makes the new mark show at once.
# Nothing else on the Desktop is touched.
param(
  [string]$Version = '0.1.6-alpha.1',
  [string]$Name = 'DavCode AGENT'
)
$ErrorActionPreference = 'Stop'

$launcherDir = Join-Path $PSScriptRoot 'launcher'
$target = Join-Path $env:LOCALAPPDATA 'dsh'
New-Item -ItemType Directory -Force -Path $target | Out-Null

$cmd = Join-Path $target 'Avvia DavCode AGENT.cmd'
Copy-Item (Join-Path $launcherDir 'Avvia DavCode AGENT.cmd') $cmd -Force
Copy-Item (Join-Path $launcherDir 'davcode.ico') $target -Force
$icon = Join-Path $target 'davcode.ico'

# The pinned version lives in one line of the launcher; the flag is how it is moved.
$text = Get-Content $cmd -Raw
$pinned = [regex]::Replace($text, 'set DSH_VERSION=.*', "set DSH_VERSION=$Version")
if ($pinned -ne $text) { [System.IO.File]::WriteAllText($cmd, $pinned, (New-Object System.Text.UTF8Encoding($false))) }

$desktop = [Environment]::GetFolderPath('Desktop')
$link = Join-Path $desktop "$Name.lnk"
Remove-Item $link -Force -ErrorAction SilentlyContinue
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = $cmd
$shortcut.WorkingDirectory = $target
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = 'Avvia DavCode AGENT (dsh web)'
$shortcut.Save()

# Explorer keeps its own icon cache, so a rewritten shortcut on its own can still draw the
# old mark. `ie4uinit -show` asks the shell to rebuild it; failing that is not an error.
try { & "$env:SystemRoot\System32\ie4uinit.exe" -show 2>$null | Out-Null } catch { }

Write-Host "launcher: $cmd"
Write-Host "icon:     $icon"
Write-Host "shortcut: $link"
Write-Host "version:  $Version (pinned in the launcher)"
Write-Host ""
Write-Host "Se Explorer mostra ancora l'icona vecchia, chiudi e riapri la cartella del Desktop."
