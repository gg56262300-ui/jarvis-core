#!/usr/bin/env bash
# VPS / cron: koopia data/jarvis.sqlite → backups/ (14 päeva hoidmine).
set -euo pipefail
ROOT="${JARVIS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DB="${ROOT}/data/jarvis.sqlite"
DEST="${ROOT}/backups"
if [[ ! -f "$DB" ]]; then
  exit 0
fi
mkdir -p "$DEST"
cp -a "$DB" "${DEST}/jarvis-sqlite-$(date +%Y%m%d_%H%M%S).sqlite"
find "$DEST" -name 'jarvis-sqlite-*.sqlite' -mtime +14 -delete 2>/dev/null || true
