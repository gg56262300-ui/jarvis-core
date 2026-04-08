#!/bin/sh
set -eu

ID="${1:-}"
if [ -z "$ID" ]; then
  echo "USAGE: ./scripts/jarvis-safe-copy-run.sh <safe_run_id>"
  exit 2
fi

./scripts/jarvis-copy-run.sh "./scripts/terminal-safe-run.sh $ID"
