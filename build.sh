#!/usr/bin/env bash
# Builds ready-to-load extension folders and zips for Firefox and Chromium browsers.
# Usage: ./build.sh
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist
for target in firefox chrome; do
  mkdir -p "dist/$target"
  cp src/* "dist/$target/"
  cp "manifests/$target.json" "dist/$target/manifest.json"
  (cd "dist/$target" && zip -q -r "../x-blocklist-$target.zip" .)
  echo "built dist/$target  (+ dist/x-blocklist-$target.zip)"
done
