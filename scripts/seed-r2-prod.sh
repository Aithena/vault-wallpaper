#!/usr/bin/env bash
# Upload fixture originals to production R2.
# Usage: from repo root → pnpm seed:r2:prod
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/apps/api"
BUCKET="awall-wallpaper"
DIR="$API/fixtures/originals"

cd "$API"

for id in wp-aurora wp-harbor wp-neon; do
  file="$DIR/${id}.jpg"
  if [[ ! -f "$file" ]]; then
    echo "missing: $file" >&2
    exit 1
  fi
  echo "→ originals/${id}.jpg"
  pnpm exec wrangler r2 object put "${BUCKET}/originals/${id}.jpg" \
    --file="$file" \
    --content-type=image/jpeg
done

echo "done. Verify download on https://awall.cc"
