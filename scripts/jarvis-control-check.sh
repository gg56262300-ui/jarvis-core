#!/bin/sh
set -eu

echo "===== CONTROL CHECK ====="
curl -s http://localhost:3000/api/debug/control-summary-compact
echo
echo
echo "===== PM2 STATUS ====="
pm2 status jarvis
