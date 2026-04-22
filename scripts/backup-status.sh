#!/bin/bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/jarvis-core}"
BACKUP_DIR="$PROJECT_DIR/backups"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "BACKUP_STATUS=missing_dir"
  echo "BACKUP_DIR=$BACKUP_DIR"
  exit 1
fi

shopt -s nullglob
candidates=("$BACKUP_DIR"/jarvis-core-*.zip "$BACKUP_DIR"/jarvis-core-*.tar.gz)
shopt -u nullglob
backup_count="${#candidates[@]}"

if [[ "$backup_count" -eq 0 ]]; then
  echo "BACKUP_STATUS=empty"
  echo "BACKUP_DIR=$BACKUP_DIR"
  echo "BACKUP_COUNT=0"
  exit 1
fi

latest_file=""
latest_epoch=0
for f in "${candidates[@]}"; do
  [[ -f "$f" ]] || continue
  if ! e="$(stat -c '%Y' "$f" 2>/dev/null)"; then
    e="$(stat -f '%m' "$f")"
  fi
  if (( e >= latest_epoch )); then
    latest_epoch="$e"
    latest_file="$f"
  fi
done

if [[ -z "$latest_file" ]]; then
  echo "BACKUP_STATUS=empty"
  echo "BACKUP_DIR=$BACKUP_DIR"
  echo "BACKUP_COUNT=0"
  exit 1
fi

latest_name="$(basename "$latest_file")"
# GNU stat (Linux) vs BSD stat (macOS)
if ! latest_epoch="$(stat -c '%Y' "$latest_file" 2>/dev/null)"; then
  latest_epoch="$(stat -f '%m' "$latest_file")"
fi
if ! latest_human="$(date -d "@$latest_epoch" '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null)"; then
  latest_human="$(date -r "$latest_epoch" '+%Y-%m-%d %H:%M:%S %Z')"
fi

echo "BACKUP_STATUS=ok"
echo "BACKUP_DIR=$BACKUP_DIR"
echo "BACKUP_COUNT=$backup_count"
echo "LATEST_FILE=$latest_name"
echo "LATEST_TIME=$latest_human"
