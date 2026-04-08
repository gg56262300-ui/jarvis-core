#!/bin/sh
set -eu

MAX_WAIT="${1:-30}"

./scripts/jarvis-wait-ready.sh "$MAX_WAIT" >/dev/null

OUT="tmp/jarvis-health-report.txt"
mkdir -p tmp

{
  echo "===== JARVIS HEALTH REPORT ====="
  echo
  echo "----- HEALTH -----"
  curl -s http://localhost:3000/health || true
  echo
  echo
  echo "----- PM2 -----"
  PM2_RAW="$(pm2 jlist 2>/dev/null || true)"
  export PM2_RAW
  python3 - <<'PY'
import json, os

raw = (os.environ.get("PM2_RAW") or "").strip()
if not raw:
    print("PM2_MISSING")
    raise SystemExit(0)
try:
    arr = json.loads(raw)
except Exception:
    print("PM2_PARSE_ERROR")
    raise SystemExit(0)
jarvis = next((x for x in arr if x.get("name") == "jarvis"), None)
if not jarvis:
    print("JARVIS_PM2_NOT_FOUND")
    raise SystemExit(0)
env = jarvis.get("pm2_env") or {}
print(f'status={env.get("status")}')
print(f'restarts={env.get("restart_time")}')
print(f'pm_uptime={env.get("pm_uptime")}')
PY
  echo
  echo
  echo "----- OPS LITE -----"
  ./scripts/jarvis-ops-lite.sh
  echo
  echo "----- LAST PLAIN -----"
  cat tmp/jarvis-confirm-last-plain.txt 2>/dev/null || echo "LAST_PLAIN_MISSING"
  echo
  echo
  echo "----- PM2 LOGS LAST 40 -----"
  pm2 logs jarvis --lines 40 --nostream 2>/dev/null || true
} | tee "$OUT"

pbcopy < "$OUT"
echo
echo "===== COPIED TO CLIPBOARD ====="
echo "$OUT"
