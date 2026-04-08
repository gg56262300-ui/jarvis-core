#!/bin/bash
set -euo pipefail

PORT=3000
PROJECT_DIR="$HOME/jarvis-core"
LOG_FILE="$PROJECT_DIR/logs/dev-hard-clean.log"

mkdir -p "$PROJECT_DIR/logs"

echo "===== KILL OLD DEV ====="
pkill -9 -f "tsx watch src/index.ts" 2>/dev/null || true
pkill -9 -f "node .*src/index.ts" 2>/dev/null || true
pkill -9 -f "jarvis-core" 2>/dev/null || true
sleep 2

echo
echo "===== FREE PORT $PORT ====="
PIDS="$(lsof -ti tcp:$PORT || true)"
if [ -n "$PIDS" ]; then
  echo "Killing PID(s): $PIDS"
  kill -9 $PIDS 2>/dev/null || true
  sleep 2
fi

echo
echo "===== VERIFY PORT FREE ====="
lsof -nP -iTCP:$PORT -sTCP:LISTEN || true

echo
echo "===== START DEV ====="
cd "$PROJECT_DIR"
nohup npm run dev > "$LOG_FILE" 2>&1 < /dev/null &
sleep 6

echo
echo "===== PORT AFTER START ====="
lsof -nP -iTCP:$PORT -sTCP:LISTEN || true

echo
echo "===== HEALTH AFTER START ====="
curl -s --max-time 5 http://localhost:$PORT/health || true

echo
echo "===== LOG TAIL ====="
tail -n 20 "$LOG_FILE" || true
