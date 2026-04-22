#!/bin/bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/jarvis-core}"
BACKUP_DIR="$PROJECT_DIR/backups"
MAX_AGE_MINUTES="${1:-${BACKUP_MAX_AGE_MINUTES:-120}}"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "BACKUP_FRESHNESS_FAIL"
  echo "FRESHNESS=fail"
  echo "REASON=missing_backup_dir"
  echo "BACKUP_DIR=$BACKUP_DIR"
  exit 1
fi

latest_file="$(ls -1t "$BACKUP_DIR"/jarvis-core-*.zip 2>/dev/null | sed -n '1p')"
if [[ -z "$latest_file" ]]; then
  echo "BACKUP_FRESHNESS_FAIL"
  echo "FRESHNESS=fail"
  echo "REASON=no_backups_found"
  echo "BACKUP_DIR=$BACKUP_DIR"
  exit 1
fi

now_epoch="$(date +%s)"
# GNU stat (Linux) vs BSD stat (macOS)
if ! latest_epoch="$(stat -c '%Y' "$latest_file" 2>/dev/null)"; then
  latest_epoch="$(stat -f '%m' "$latest_file")"
fi
age_seconds="$((now_epoch - latest_epoch))"
max_age_seconds="$((MAX_AGE_MINUTES * 60))"
age_minutes="$((age_seconds / 60))"
latest_name="$(basename "$latest_file")"

if (( age_seconds <= max_age_seconds )); then
  echo "BACKUP_FRESHNESS_OK"
  echo "FRESHNESS=ok"
  echo "AGE_MINUTES=$age_minutes"
  echo "MAX_AGE_MINUTES=$MAX_AGE_MINUTES"
  echo "LATEST_FILE=$latest_name"
  exit 0
fi

echo "BACKUP_FRESHNESS_STALE"
echo "FRESHNESS=stale"
echo "AGE_MINUTES=$age_minutes"
echo "MAX_AGE_MINUTES=$MAX_AGE_MINUTES"
echo "LATEST_FILE=$latest_name"
exit 1
