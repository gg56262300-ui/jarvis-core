#!/bin/sh
set -eu

URL="$(grep -oE 'https://[a-zA-Z0-9.-]+trycloudflare\.com' /tmp/jarvis-cloudflared.log 2>/dev/null | tail -n 1 || true)"
if [ -z "${URL:-}" ]; then
  URL="$(ps -Ao command | grep -E 'cloudflared|trycloudflare' | grep -v grep | grep -oE 'https://[a-zA-Z0-9.-]+trycloudflare\.com' | tail -n 1 || true)"
fi
if [ -z "${URL:-}" ]; then
  URL="$(grep -hEo 'https://[a-zA-Z0-9.-]+trycloudflare\.com' docs/checkpoints/bridge-working-*.txt 2>/dev/null | tail -n 1 || true)"
fi

TOKEN="$(python3 - <<'PY'
from pathlib import Path
lines = Path(".env").read_text(encoding="utf-8").splitlines()
hits = [x for x in lines if x.startswith("JARVIS_BRIDGE_TOKEN=")]
print(hits[-1].split("=",1)[1] if hits else "")
PY
)"

echo "===== JARVIS MIN REPORT ====="
echo "LOCAL_HEALTH"
curl -s http://localhost:3000/health || true
echo
echo "PUBLIC_URL"
echo "${URL:-MISSING}"
echo
echo "PUBLIC_HEALTH"
if [ -n "${URL:-}" ]; then
  curl -s "$URL/health" || true
else
  echo "MISSING_URL"
fi
echo
echo "BRIDGE_LATEST_HEAD"
if [ -n "${URL:-}" ] && [ -n "${TOKEN:-}" ]; then
  RAW="$(curl -s "$URL/api/debug/bridge/latest?token=$TOKEN" || true)"
  if [ -z "$RAW" ]; then
    echo "EMPTY"
  else
    printf '%s' "$RAW" | python3 -c '
import sys, json
raw = sys.stdin.read().strip()
if not raw:
    print("EMPTY")
    raise SystemExit(0)
try:
    j = json.loads(raw)
except Exception:
    print(raw[:800])
    raise SystemExit(0)
print("ok=", j.get("ok"))
print("bridge=", j.get("bridge"))
latest = j.get("latest") or {}
print("cmd=", latest.get("cmd"))
print("exit_code=", latest.get("exit_code"))
for line in (latest.get("output") or "").splitlines()[:8]:
    print(line)
'
  fi
else
  echo "MISSING_URL_OR_TOKEN"
fi
