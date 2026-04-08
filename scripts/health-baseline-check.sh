#!/bin/bash
set -u

cd ~/jarvis-core || exit 1

echo
echo "===== HEALTH BASELINE CURRENT ====="
shasum package.json scripts/health-check.sh

echo
echo "===== HEALTH BASELINE SAVED ====="
cat logs/health-baseline.sha1

echo
echo "===== HEALTH BASELINE DIFF ====="
diff -u logs/health-baseline.sha1 <(shasum package.json scripts/health-check.sh) || true
