#!/usr/bin/env bash
set -euo pipefail

TEXT="${1:-homme kell 10 pane kalendrisse GUARD TEST}"
TOKEN="$(pm2 jlist | python3 -c 'import json,sys; data=json.load(sys.stdin); apps=[a for a in data if a.get("name")=="jarvis"]; env=((apps[0].get("pm2_env",{}).get("env",{})) if apps else {}); print((env.get("JARVIS_BRIDGE_TOKEN") or "").strip())')"

echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="
echo "===== CALENDAR PREFLIGHT ====="
echo "TOKEN_LEN=${#TOKEN}"
curl -fsS http://localhost:3000/health >/dev/null && echo "HEALTH_OK"
[ -n "$TOKEN" ] && echo "TOKEN_OK" || { echo "TOKEN_MISSING"; exit 2; }

echo
echo "===== CALENDAR WRITE ====="
RESP="$(curl -sS -X POST "http://localhost:3000/api/debug/bridge/calendar-write?token=$TOKEN" \
-H 'Content-Type: application/json' \
--data-raw "$(printf '{"text":"%s"}' "$(printf '%s' "$TEXT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])')")")"
echo "$RESP"

echo
echo "===== CALENDAR VERIFY ====="
curl -sS http://localhost:3000/api/calendar/upcoming
