#!/bin/sh
set -eu

MAX_WAIT="${1:-30}"

./scripts/jarvis-wait-ready.sh "$MAX_WAIT" >/dev/null

echo "===== OPS LITE ====="
./scripts/jarvis-ops-lite.sh

echo
echo "===== HEALTH PLAIN ====="
./scripts/jarvis-confirm-plain.sh health

echo
echo "===== EXECUTION STATE PLAIN ====="
./scripts/jarvis-confirm-plain.sh execution_state_compact
