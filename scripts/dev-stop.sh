#!/bin/bash
set -euo pipefail

PORT=3000

echo "===== STOP DEV ====="
pkill -9 -f "tsx watch src/index.ts" 2>/dev/null || true
pkill -9 -f "node .*src/index.ts" 2>/dev/null || true

PIDS="$(lsof -ti tcp:$PORT || true)"
if [ -n "$PIDS" ]; then
  kill -9 $PIDS 2>/dev/null || true
fi

sleep 2

echo
echo "===== PORT AFTER STOP ====="
lsof -nP -iTCP:$PORT -sTCP:LISTEN || true
