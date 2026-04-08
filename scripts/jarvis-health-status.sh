#!/bin/sh
set -eu

MAX_WAIT="${1:-30}"

./scripts/jarvis-wait-ready.sh "$MAX_WAIT" >/dev/null

HEALTH_JSON="$(curl -s http://localhost:3000/health || true)"
PM2_RAW="$(pm2 jlist 2>/dev/null || true)"
OPS_TEXT="$(./scripts/jarvis-ops-lite.sh 2>/dev/null || true)"

export HEALTH_JSON PM2_RAW OPS_TEXT

python3 - <<'PY'
import json, os

health_raw = (os.environ.get("HEALTH_JSON") or "").strip()
pm2_raw = (os.environ.get("PM2_RAW") or "").strip()
ops_text = (os.environ.get("OPS_TEXT") or "").strip()

health_ok = False
pm2_online = False
execution_done = False

try:
    health = json.loads(health_raw) if health_raw else {}
    health_ok = health.get("status") == "ok"
except Exception:
    health_ok = False

try:
    arr = json.loads(pm2_raw) if pm2_raw else []
    jarvis = next((x for x in arr if x.get("name") == "jarvis"), None)
    env = (jarvis or {}).get("pm2_env") or {}
    pm2_online = env.get("status") == "online"
except Exception:
    pm2_online = False

execution_done = "execution: status=completed" in ops_text

overall = "🟢 KORRAS" if health_ok and pm2_online and execution_done else "🟡 TÄHELEPANU"

print("===== JARVIS HEALTH STATUS =====")
print(f"üldseis: {overall}")
print(f"health: {'🟢 korras' if health_ok else '🔴 probleem'}")
print(f"pm2: {'🟢 online' if pm2_online else '🔴 probleem'}")
print(f"execution: {'🟢 completed' if execution_done else '🟡 kontrolli'}")
PY
