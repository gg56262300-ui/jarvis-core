#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

echo "===== SAFE PATCH GATE ====="

echo "STEP 0: PREFLIGHT"
./scripts/preflight-check.sh

echo
echo "STEP 0.1: BACKUP FRESHNESS"
./scripts/backup-freshness-check.sh 30

echo
echo "STEP 0.2: STATE GATE"
./scripts/state-gate-check.sh

echo
echo "STEP 0.3: STALE PENDING GATE"
./scripts/stale-pending-check.sh 30

echo
echo "STEP 0.4: STALE EXECUTION GATE"
./scripts/stale-execution-check.sh 30

echo
echo "STEP 1: BUILD"
if ! npm run build; then
  echo
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
  echo "BUILD_GATE_STOP: build failed, restart and tests were NOT executed"
  exit 1
fi

echo
echo "STEP 2: PM2 RESTART"
pm2 restart jarvis --update-env

echo
echo "STEP 3: TEST"
sleep 2
HEALTH_RAW="$(curl -s http://127.0.0.1:3000/health || true)"
echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="
if [ -z "$HEALTH_RAW" ]; then
  echo "HEALTH_STATUS: missing"
  exit 1
fi
echo "$HEALTH_RAW"
echo
echo "HEALTH_STATUS: ok"
