#!/usr/bin/env bash
set -euo pipefail

TOKEN="$(pm2 jlist | python3 -c 'import json,sys; data=json.load(sys.stdin); apps=[a for a in data if a.get("name")=="jarvis"]; env=((apps[0].get("pm2_env",{}).get("env",{})) if apps else {}); print((env.get("JARVIS_BRIDGE_TOKEN") or "").strip())')"

if [ -z "$TOKEN" ]; then
  echo "JARVIS_BRIDGE_TOKEN_MISSING"
  exit 3
fi

curl -sS -X POST "http://localhost:3000/api/debug/bridge/calendar-undo-last?token=$TOKEN"
