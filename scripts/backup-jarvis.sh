#!/bin/bash
set -euo pipefail

PROJECT_DIR="$HOME/jarvis-core"
BACKUP_DIR="$PROJECT_DIR/backups"
STAMP="$(date +%Y-%m-%d_%H-%M-%S)"

mkdir -p "$BACKUP_DIR"

if command -v zip >/dev/null 2>&1; then
  ZIP_FILE="$BACKUP_DIR/jarvis-core-$STAMP.zip"
  cd "$HOME"
  zip -rq "$ZIP_FILE" jarvis-core \
    -x "jarvis-core/node_modules/*" \
       "jarvis-core/.git/*" \
       "jarvis-core/backups/*" \
       "jarvis-core/*.zip" \
       "jarvis-core/logs/*"

  if [[ -f "$PROJECT_DIR/.env" ]]; then
    (cd "$HOME" && zip -q "$ZIP_FILE" jarvis-core/.env)
  fi

  find "$BACKUP_DIR" -type f \( -name 'jarvis-core-*.zip' -o -name 'jarvis-core-*.tar.gz' \) -mtime +7 -delete
  echo "OK: varukoopia loodud -> $ZIP_FILE"
  exit 0
fi

if ! command -v tar >/dev/null 2>&1; then
  echo "FAIL: zip ja tar pole kättesaadavad; paigalda zip (soovitus) või tar." >&2
  exit 1
fi

ARCH_FILE="$BACKUP_DIR/jarvis-core-$STAMP.tar.gz"
cd "$HOME"
tar \
  --exclude='jarvis-core/node_modules' \
  --exclude='jarvis-core/.git' \
  --exclude='jarvis-core/backups' \
  --exclude='jarvis-core/logs' \
  --exclude='jarvis-core/*.zip' \
  --exclude='jarvis-core/*.tar.gz' \
  -czf "$ARCH_FILE" jarvis-core

find "$BACKUP_DIR" -type f \( -name 'jarvis-core-*.zip' -o -name 'jarvis-core-*.tar.gz' \) -mtime +7 -delete
echo "OK: varukoopia loodud -> $ARCH_FILE (tar.gz, zip puudub)"
