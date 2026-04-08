#!/bin/sh
set -eu

MAX_WAIT="${1:-30}"

pm2 restart jarvis >/dev/null
./scripts/jarvis-wait-ready.sh "$MAX_WAIT" >/dev/null
./scripts/jarvis-ops-quick-check.sh "$MAX_WAIT"
