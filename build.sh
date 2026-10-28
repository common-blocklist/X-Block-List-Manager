#!/usr/bin/env bash
# Builds ready-to-load extension folders, zips, and release packages.
#   dist/firefox, dist/chrome                 unpacked builds
#   dist/x-blocklist-{firefox,chrome}.zip     store-upload zips (AMO / Chrome Web Store)
#   dist/x-blocklist-firefox.xpi              same files as the Firefox zip (unsigned)
#   dist/x-blocklist-chrome.crx               needs a private key (keys/chrome.pem) and a Chromium binary
# Usage: ./build.sh            (CHROME_BIN=/path/to/chrome ./build.sh to also pack the .crx)
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist
for target in firefox chrome; do
  mkdir -p "dist/$target"
  cp -r src/* "dist/$target/"
  cp "manifests/$target.json" "dist/$target/manifest.json"
  (cd "dist/$target" && zip -q -r "../x-blocklist-$target.zip" .)
  echo "built dist/$target  (+ dist/x-blocklist-$target.zip)"
done

cp dist/x-blocklist-firefox.zip dist/x-blocklist-firefox.xpi
echo "built dist/x-blocklist-firefox.xpi (unsigned; sign via addons.mozilla.org to install on release Firefox)"

if [ -n "${CHROME_BIN:-}" ]; then
  mkdir -p keys
  if [ -f keys/chrome.pem ]; then
    "$CHROME_BIN" --no-sandbox --pack-extension="$PWD/dist/chrome" --pack-extension-key="$PWD/keys/chrome.pem" >/dev/null 2>&1 || true
  else
    "$CHROME_BIN" --no-sandbox --pack-extension="$PWD/dist/chrome" >/dev/null 2>&1 || true
    [ -f dist/chrome.pem ] && mv dist/chrome.pem keys/chrome.pem && echo "generated keys/chrome.pem (keep it private, never commit it)"
  fi
  [ -f dist/chrome.crx ] && mv dist/chrome.crx dist/x-blocklist-chrome.crx && echo "built dist/x-blocklist-chrome.crx"
fi
