#!/bin/sh
set -eu
ID="${1:-health}"
curl -s -X POST "http://localhost:3000/api/debug/terminal-request/$ID" >/dev/null 2>&1
REQ_ID="$(curl -s http://localhost:3000/api/debug/terminal-pending | python3 -c 'import sys,json; print(json.load(sys.stdin)["requestId"])')"
curl -s -X POST "http://localhost:3000/api/debug/terminal-confirm/$REQ_ID" >/dev/null 2>&1
sleep 1
echo "===== PUBLIC STATE NOW ====="
curl -sS -H "Cache-Control: no-cache" -H "Pragma: no-cache" "https://prospect-tom-lbs-hood.trycloudflare.com/api/debug/terminal-state?ts=$(date +%s)"
echo
echo
echo "===== PUBLIC LATEST NOW ====="
curl -sS -H "Cache-Control: no-cache" -H "Pragma: no-cache" "https://prospect-tom-lbs-hood.trycloudflare.com/api/debug/bridge/latest?ts=$(date +%s)&token=jarvis-bridge-2026-04-07"
