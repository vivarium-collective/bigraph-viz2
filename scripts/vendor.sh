#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
cd "$HERE/js"
npm ci
npm run build
mkdir -p "$HERE/py/bigraph_viz2/_bundle"
cp dist/bigraph-viz2.iife.min.js "$HERE/py/bigraph_viz2/_bundle/"
# vite may emit the CSS as either bigraph-viz2.css or style.css depending on entry naming
if [ -f "dist/bigraph-viz2.css" ]; then
  cp dist/bigraph-viz2.css "$HERE/py/bigraph_viz2/_bundle/"
elif [ -f "dist/style.css" ]; then
  cp dist/style.css "$HERE/py/bigraph_viz2/_bundle/bigraph-viz2.css"
else
  echo "ERROR: no CSS output found in js/dist/" >&2
  ls -la dist/ >&2
  exit 1
fi
echo "✔ vendored bundle into py/bigraph_viz2/_bundle/"
