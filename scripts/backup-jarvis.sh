#!/bin/bash
set -euo pipefail

PROJECT_DIR="$HOME/jarvis-core"
BACKUP_DIR="$PROJECT_DIR/backups"
STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
ZIP_FILE="$BACKUP_DIR/jarvis-core-$STAMP.zip"

mkdir -p "$BACKUP_DIR"

cd "$HOME"
zip -rq "$ZIP_FILE" jarvis-core \
  -x "jarvis-core/node_modules/*" \
     "jarvis-core/.git/*" \
     "jarvis-core/backups/*" \
     "jarvis-core/*.zip" \
     "jarvis-core/logs/*"

find "$BACKUP_DIR" -type f -name "jarvis-core-*.zip" -mtime +7 -delete
echo "OK: varukoopia loodud -> $ZIP_FILE"
