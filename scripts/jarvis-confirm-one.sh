#!/bin/sh
set -eu

ID="${1:-health}"

BASE_URL="${JARVIS_BASE_URL:-http://localhost:3000}"

REQ_JSON="$(curl -s -X POST "$BASE_URL/api/debug/terminal-request/$ID")"
REQ_ID="$(printf '%s' "$REQ_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["requestId"])')"

echo "===== REQUEST ====="
printf '%s\n' "$REQ_JSON"
echo

echo "===== CONFIRM ====="
curl -s -X POST "$BASE_URL/api/debug/terminal-confirm/$REQ_ID"
echo
