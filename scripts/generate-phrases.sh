#!/usr/bin/env bash
# Generate the quick-reply phrase files for every language using Home Assistant
# Cloud TTS, and copy them to /config/sounds/doorbell/<lang>/ on your HA host.
#
# Cross-platform: needs only bash, curl and jq. No macOS `say` required.
#
# Usage:
#   HA_URL=http://homeassistant.local:8123 \
#   HA_TOKEN=<long-lived-token> \
#   HA_SSH="root@homeassistant.local" \
#   ./generate-phrases.sh
#
# HA_SSH is optional — if set, files are scp'd to the host. Otherwise they are
# written to ./out/ for you to copy manually into /config/sounds/doorbell/.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PHRASES="$HERE/../homeassistant/phrases.json"
ENGINE="${TTS_ENGINE:-tts.home_assistant_cloud}"
OUT="${OUT:-$HERE/out}"
: "${HA_URL:?set HA_URL}"; : "${HA_TOKEN:?set HA_TOKEN}"

langs=$(jq -r '.languages | keys[]' "$PHRASES")
for lang in $langs; do
  locale=$(jq -r ".languages.$lang.locale" "$PHRASES")
  mkdir -p "$OUT/$lang"
  for key in brb porch help moment no_thanks; do
    text=$(jq -r ".languages.$lang.$key" "$PHRASES")
    url=$(curl -s -X POST -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
      -d "$(jq -nc --arg e "$ENGINE" --arg m "$text" --arg l "$locale" \
            '{engine_id:$e,message:$m,language:$l}')" \
      "$HA_URL/api/tts_get_url" | jq -r '.url')
    curl -s "$url" -o "$OUT/$lang/$key.mp3"
    echo "  $lang/$key.mp3  ($locale)"
  done
done

if [ -n "${HA_SSH:-}" ]; then
  echo "Copying to $HA_SSH:/config/sounds/doorbell/ ..."
  ssh "$HA_SSH" 'mkdir -p /config/sounds/doorbell'
  scp -r "$OUT"/* "$HA_SSH:/config/sounds/doorbell/"
  echo "Done. Files installed on the HA host."
else
  echo "Done. Files in $OUT — copy them to /config/sounds/doorbell/ on your HA host."
fi
