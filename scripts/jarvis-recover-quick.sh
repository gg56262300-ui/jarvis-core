#!/bin/sh
set -eu

MAX_WAIT="${1:-30}"

npm run backup >/dev/null
pm2 restart jarvis >/dev/null
./scripts/jarvis-wait-ready.sh "$MAX_WAIT" >/dev/null
./scripts/jarvis-health-status.sh "$MAX_WAIT"
