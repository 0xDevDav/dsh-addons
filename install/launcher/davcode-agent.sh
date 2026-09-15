#!/usr/bin/env sh
# Launcher for the DavCode AGENT Web UI (the Unix counterpart of the .cmd beside it).
#
# `install/shortcut.sh` installs this file as ~/.local/bin/davcode-agent and points a Desktop
# entry at it. The version is pinned on purpose: the Italian language pack and the brand pack
# are built and verified against one release, and starting a different one silently would
# leave the strings a release adds in English. Override with DSH_VERSION, or edit the default.
set -eu
DSH_VERSION=${DSH_VERSION:-0.1.6-alpha.1}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non trovato. Installa da https://nodejs.org" >&2
  exit 1
fi

echo "Avvio DavCode AGENT (DSH $DSH_VERSION, Web UI su http://127.0.0.1:3080)..."
exec npx -y "@deepseek-ai/dsh@$DSH_VERSION" web
