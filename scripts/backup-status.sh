#!/bin/bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/jarvis-core}"
BACKUP_DIR="$PROJECT_DIR/backups"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "BACKUP_STATUS=missing_dir"
  echo "BACKUP_DIR=$BACKUP_DIR"
  exit 1
fi

latest_file="$(ls -1t "$BACKUP_DIR"/jarvis-core-*.zip 2>/dev/null | sed -n '1p')"
backup_count="$(ls -1 "$BACKUP_DIR"/jarvis-core-*.zip 2>/dev/null | wc -l | awk '{print $1}')"

if [[ -z "$latest_file" ]]; then
  echo "BACKUP_STATUS=empty"
  echo "BACKUP_DIR=$BACKUP_DIR"
  echo "BACKUP_COUNT=0"
  exit 1
fi

latest_name="$(basename "$latest_file")"
latest_epoch="$(stat -f '%m' "$latest_file")"
latest_human="$(date -r "$latest_epoch" '+%Y-%m-%d %H:%M:%S %Z')"

echo "BACKUP_STATUS=ok"
echo "BACKUP_DIR=$BACKUP_DIR"
echo "BACKUP_COUNT=$backup_count"
echo "LATEST_FILE=$latest_name"
echo "LATEST_TIME=$latest_human"
