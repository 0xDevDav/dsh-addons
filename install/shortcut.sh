#!/usr/bin/env sh
# Put the DavCode AGENT launcher on PATH and (re)create the Desktop entry with the brand's
# own icon — the Unix counterpart of shortcut.ps1.
#
#   sh install/shortcut.sh              (DSH_VERSION overrides the pinned release)
#
# Re-running it refreshes both the launcher and the icon.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
version=${DSH_VERSION:-0.1.6-alpha.1}

bin="$HOME/.local/bin"
icons="$HOME/.local/share/icons/hicolor/256x256/apps"
applications="$HOME/.local/share/applications"
mkdir -p "$bin" "$icons" "$applications"

sed "s/^DSH_VERSION=\${DSH_VERSION:-.*}/DSH_VERSION=\${DSH_VERSION:-$version}/" \
  "$root/install/launcher/davcode-agent.sh" > "$bin/davcode-agent"
chmod 755 "$bin/davcode-agent"

# The .ico is what Windows needs; a PNG of the same mark is what the freedesktop entry wants.
if command -v convert >/dev/null 2>&1; then
  convert "$root/install/launcher/davcode.ico[0]" "$icons/davcode-agent.png" 2>/dev/null || true
fi
if [ ! -f "$icons/davcode-agent.png" ]; then
  echo "nota: nessun convert (ImageMagick) per estrarre il PNG dal .ico."
  echo "      genera l'icona con: node tools/brand/make-icon.mjs, poi copia lab/icon-256.png"
  echo "      in $icons/davcode-agent.png"
fi

entry="$applications/davcode-agent.desktop"
cat > "$entry" <<EOF
[Desktop Entry]
Type=Application
Name=DavCode AGENT
Comment=Avvia DavCode AGENT (dsh web)
Exec=$bin/davcode-agent
Icon=davcode-agent
Terminal=true
Categories=Development;
EOF
chmod 644 "$entry"

desktop_dir="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
if [ -d "$desktop_dir" ]; then
  cp "$entry" "$desktop_dir/davcode-agent.desktop"
  chmod 755 "$desktop_dir/davcode-agent.desktop"
  if command -v gio >/dev/null 2>&1; then gio set "$desktop_dir/davcode-agent.desktop" metadata::trusted true 2>/dev/null || true; fi
fi

echo "launcher: $bin/davcode-agent"
echo "entry:    $entry"
echo "version:  $version (pinned in the launcher)"
