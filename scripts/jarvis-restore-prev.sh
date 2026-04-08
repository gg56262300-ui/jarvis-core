#!/bin/sh
set -eu

echo "===== ROLLBACK PREVIEW ====="
./scripts/jarvis-safe-copy-plain.sh terminal_restore_check_compact

echo
printf "Type RESTORE and press Enter to continue: "
read -r ANSWER

if [ "$ANSWER" != "RESTORE" ]; then
  echo "ROLLBACK_CANCELLED"
  exit 1
fi

echo
echo "===== ROLLBACK RUN ====="
./scripts/jarvis-copy-run.sh 'curl -s -X POST http://localhost:3000/api/debug/terminal-restore-prev'

echo
echo "===== ROLLBACK CHECK AFTER ====="
./scripts/jarvis-safe-copy-plain.sh terminal_restore_check_compact
