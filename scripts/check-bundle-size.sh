#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
F="$HERE/js/dist/bigraph-viz2.iife.min.js"
[ -f "$F" ] || { echo "build first (npm --prefix js run build)"; exit 1; }
GZ=$(gzip -c "$F" | wc -c | tr -d ' ')
LIMIT=51200
echo "gzipped bundle: $GZ bytes (limit $LIMIT)"
if [ "$GZ" -gt "$LIMIT" ]; then echo "❌ exceeds 50KB"; exit 1; fi
echo "✔ within budget"
