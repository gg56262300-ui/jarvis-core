#!/bin/sh
set -eu

BASE_URL="${JARVIS_BASE_URL:-http://localhost:3000}"
MAX_WAIT="${1:-30}"

i=0
while [ "$i" -lt "$MAX_WAIT" ]; do
  if curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
    echo "JARVIS_READY"
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done

echo "JARVIS_NOT_READY"
exit 1
