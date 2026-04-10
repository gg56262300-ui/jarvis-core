#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ "${NO_COPY_MARKER:-0}" != "1" ]; then
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
fi

echo "===== STATUS DASHBOARD ====="

echo
echo "STEP 1: BACKUP FRESHNESS"
./scripts/backup-freshness-check.sh 30 || true

echo
echo "STEP 2: STATE GATE"
./scripts/state-gate-check.sh || true

echo
echo "STEP 3: STALE PENDING"
./scripts/stale-pending-check.sh 30 || true

echo
echo "STEP 4: STALE EXECUTION"
./scripts/stale-execution-check.sh 30 || true

echo
echo "STEP 5: HEALTH"
HEALTH_RAW="$(curl -s http://127.0.0.1:3000/health || true)"
if [ -z "$HEALTH_RAW" ]; then
  echo "HEALTH_STATUS: missing"
else
  echo "$HEALTH_RAW"
  echo
  echo "HEALTH_STATUS: ok"
fi
