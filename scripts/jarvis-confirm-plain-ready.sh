#!/bin/sh
set -eu

ID="${1:-health}"
MAX_WAIT="${2:-30}"

./scripts/jarvis-wait-ready.sh "$MAX_WAIT" >/dev/null
./scripts/jarvis-confirm-plain.sh "$ID"
