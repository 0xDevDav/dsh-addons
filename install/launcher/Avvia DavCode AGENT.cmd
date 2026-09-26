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
set DSH_VERSION=0.1.7-rc.2

title DavCode AGENT
where node >nul 2>nul || (echo Node.js non trovato. Installa da https://nodejs.org & pause & exit /b 1)
echo Avvio DavCode AGENT (DSH %DSH_VERSION%, Web UI su http://127.0.0.1:3080)...

rem A cache of its own. An npx run interrupted in the shared npm cache leaves a lock there, and
rem npm then reports ECOMPROMISED / "Lock compromised" for every later run without starting
rem anything; a half-extracted tree does the same. Keeping this launcher's cache separate means
rem a launch can neither damage nor be damaged by whatever else uses npm on this machine.
set npm_config_cache=%LOCALAPPDATA%\dsh\npm-cache
npx -y @deepseek-ai/dsh@%DSH_VERSION% web

if errorlevel 1 (
  echo Cache dedicata non utilizzabile: riprovo con la cache npm condivisa...
  set npm_config_cache=
  npx -y @deepseek-ai/dsh@%DSH_VERSION% web
)

echo.
echo DavCode AGENT terminato.
pause
