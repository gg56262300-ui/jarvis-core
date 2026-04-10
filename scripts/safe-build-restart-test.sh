#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

echo "===== SAFE BUILD GATE ====="
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
echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="
curl -s http://127.0.0.1:3000/health
