#!/bin/bash
set -euo pipefail

PORT=3000

echo "===== PORT ====="
lsof -nP -iTCP:$PORT -sTCP:LISTEN || true

echo
echo "===== HEALTH ====="
curl -i --max-time 5 http://localhost:$PORT/health || true

echo
echo "===== JOBS ====="
curl --max-time 5 -s http://localhost:$PORT/api/jobs/status | python3 -m json.tool || true

echo
echo "===== NODE ====="
ps -Ao pid,ppid,%cpu,%mem,rss,command | grep -E "jarvis-core|tsx watch|src/index.ts|esbuild --service" | grep -v grep || true
