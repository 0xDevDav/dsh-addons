#!/usr/bin/env sh
# Install these packs into the local DSH Web profile.
# Requires: the `dsh` CLI and pnpm on PATH. Set DSH_CMD to override the command.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
dsh=${DSH_CMD:-dsh}
harness_home=${DSH_HOME:-$HOME/.dsh}

for pack in dsh-locale-it dsh-session-cost dsh-brand-davcode; do
  echo "installing $pack from $root/packages/$pack"
  "$dsh" plugin --profile web add "$root/packages/$pack"
done

settings="$harness_home/settings.yaml"
if [ -f "$settings" ]; then
  if grep -q '^locale:' "$settings"; then
    echo "settings.yaml already has a locale section; leaving it alone"
  else
    printf 'locale:\n  preference: it\n' >> "$settings"
    echo "seeded locale.preference: it in $settings"
  fi
else
  echo "no settings.yaml yet: pick Italiano in Settings > Generale > Lingua after the first start"
fi

echo
echo "done. Restart the Web surface (stop and relaunch dsh web), then reload the page."
