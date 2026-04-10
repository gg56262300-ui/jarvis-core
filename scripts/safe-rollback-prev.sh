#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

MODE="${1:-live}"

echo "===== SAFE ROLLBACK GATE ====="
echo "MODE: $MODE"

echo "STEP 0: PREVIEW"
./scripts/jarvis-safe-copy-plain.sh terminal_restore_check_compact

echo
printf "Type RESTORE and press Enter to continue: "
read -r ANSWER

if [ "$ANSWER" != "RESTORE" ]; then
  echo
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
  echo "ROLLBACK_CANCELLED"
  exit 1
fi

if [ "$MODE" = "dry-run" ]; then
  echo
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
  echo "ROLLBACK_DRY_RUN_OK: preview and confirm worked, restore/build/restart were intentionally skipped"
  exit 0
fi

echo
echo "STEP 1: RESTORE"
RESTORE_JSON="$(curl -s -X POST http://localhost:3000/api/debug/terminal-restore-prev)"
echo "$RESTORE_JSON"

echo
echo "STEP 2: BUILD"
if ! npm run build; then
  echo
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
  echo "ROLLBACK_GATE_STOP: restore done, but build failed; restart was NOT executed"
  exit 1
fi

echo
echo "STEP 3: PM2 RESTART"
pm2 restart jarvis --update-env

echo
echo "STEP 4: HEALTH"
sleep 2
HEALTH_JSON="$(curl -s http://127.0.0.1:3000/health)"
echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="
echo "===== ROLLBACK RESULT ====="
echo "$RESTORE_JSON"
echo
echo "===== HEALTH AFTER ROLLBACK ====="
echo "$HEALTH_JSON"
