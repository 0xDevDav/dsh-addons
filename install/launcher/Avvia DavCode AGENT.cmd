@echo off
rem Launcher for the DavCode AGENT Web UI.
rem
rem `install\shortcut.ps1` copies this file and the icon beside it into %LOCALAPPDATA%\dsh
rem and points a Desktop shortcut at it, so the working copy stays in the repository.
rem
rem The version is pinned on purpose: the Italian language pack and the brand pack are built
rem and verified against one release, and starting a different one silently would leave the
rem strings a release adds in English and could move the seats the brand uses. To move to a
rem newer release, change the line below (or run `install\install.ps1 -Version <version>`),
rem then run the repository's own suites again.
set DSH_VERSION=0.1.6-alpha.1

title DavCode AGENT
where node >nul 2>nul || (echo Node.js non trovato. Installa da https://nodejs.org & pause & exit /b 1)
echo Avvio DavCode AGENT (DSH %DSH_VERSION%, Web UI su http://127.0.0.1:3080)...
npx -y @deepseek-ai/dsh@%DSH_VERSION% web
echo.
echo DavCode AGENT terminato.
pause
