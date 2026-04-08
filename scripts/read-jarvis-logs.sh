#!/bin/bash
set -euo pipefail

cd ~/jarvis-core

echo "======================================"
echo " JARVIS LOGIDE LUGEMINE"
echo "======================================"
echo

echo "===== BACKEND LOGI: VIIMASED 30 RIDA ====="
if [ -f logs/jarvis-backend.log ]; then
  tail -n 30 logs/jarvis-backend.log
else
  echo "Fail puudub: logs/jarvis-backend.log"
fi

echo
echo "===== WATCHER LOGI: VIIMASED 30 RIDA ====="
if [ -f logs/jarvis-watcher.log ]; then
  tail -n 30 logs/jarvis-watcher.log
else
  echo "Fail puudub: logs/jarvis-watcher.log"
fi

echo
echo "===== LÕPP ====="
