#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="
echo "===== JARVIS HEALTH WATCH ====="

echo "-- HEALTH --"
curl -sS http://localhost:3000/health || true
echo
echo

echo "-- PM2 --"
pm2 status jarvis || true
echo
echo

echo "-- TOKEN --"
TOKEN="$(pm2 jlist | python3 -c 'import json,sys; data=json.load(sys.stdin); apps=[a for a in data if a.get("name")=="jarvis"]; env=((apps[0].get("pm2_env",{}).get("env",{})) if apps else {}); print("yes" if (env.get("JARVIS_BRIDGE_TOKEN") or "").strip() else "no")')"
echo "BRIDGE_TOKEN_SET=$TOKEN"
echo
echo

echo "-- CALENDAR REGRESSION --"
./scripts/calendar-regression-pack.sh || true
