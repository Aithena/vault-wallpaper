#!/usr/bin/env bash
# Upload fixture originals into local Miniflare R2 (wrangler --local).
# Usage: from repo root → pnpm seed:r2
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/apps/api"
BUCKET="vault-wallpaper-preview"
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
    --content-type=image/jpeg \
    --local
done

echo "done. Verify: login → buy max → download on http://localhost:18811"
