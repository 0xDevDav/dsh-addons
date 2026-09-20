#!/usr/bin/env sh
# Launcher for the DavCode AGENT Web UI (the Unix counterpart of the .cmd beside it).
#
# `install/shortcut.sh` installs this file as ~/.local/bin/davcode-agent and points a Desktop
# entry at it. The version is pinned on purpose: the Italian language pack and the brand pack
# are built and verified against one release, and starting a different one silently would
# leave the strings a release adds in English. Override with DSH_VERSION, or edit the default.
set -eu
DSH_VERSION=${DSH_VERSION:-0.1.6-alpha.2}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non trovato. Installa da https://nodejs.org" >&2
  exit 1
fi

echo "Avvio DavCode AGENT (DSH $DSH_VERSION, Web UI su http://127.0.0.1:3080)..."
if npx -y "@deepseek-ai/dsh@$DSH_VERSION" web; then
  exit 0
fi

# The shared npm cache can hold a stale npx lock from an interrupted install, which npm
# reports as ECOMPROMISED / "Lock compromised" without starting anything at all. A cache of
# its own cannot collide with another process, so the second attempt is the one that runs.
echo "Primo tentativo non riuscito: riprovo con una cache npm dedicata..." >&2
npm_config_cache="${XDG_CACHE_HOME:-$HOME/.cache}/dsh-npm" npx -y "@deepseek-ai/dsh@$DSH_VERSION" web
