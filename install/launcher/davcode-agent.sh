#!/usr/bin/env sh
# Launcher for the DavCode AGENT Web UI (the Unix counterpart of the .cmd beside it).
#
# `install/shortcut.sh` installs this file as ~/.local/bin/davcode-agent and points a Desktop
# entry at it. The version is pinned on purpose: the Italian language pack and the brand pack
# are built and verified against one release, and starting a different one silently would
# leave the strings a release adds in English. Override with DSH_VERSION, or edit the default.
set -eu
DSH_VERSION=${DSH_VERSION:-0.2.0-rc.2}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non trovato. Installa da https://nodejs.org" >&2
  exit 1
fi

echo "Avvio DavCode AGENT (DSH $DSH_VERSION, Web UI su http://127.0.0.1:3080)..."

# A cache of its own. An npx run interrupted in the shared npm cache leaves a lock there, and
# npm then reports ECOMPROMISED / "Lock compromised" for every later run without starting
# anything; a half-extracted tree does the same. Keeping this launcher's cache separate means a
# launch can neither damage nor be damaged by whatever else uses npm on this machine.
if npm_config_cache="${XDG_CACHE_HOME:-$HOME/.cache}/dsh-npm" npx -y "@deepseek-ai/dsh@$DSH_VERSION" web; then
  exit 0
fi

echo "Cache dedicata non utilizzabile: riprovo con la cache npm condivisa..." >&2
npx -y "@deepseek-ai/dsh@$DSH_VERSION" web
