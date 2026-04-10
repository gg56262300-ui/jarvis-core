#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

MAX_PENDING_MINUTES="${1:-30}"

echo "===== STALE PENDING CHECK ====="

fail() {
  echo
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
  echo "STALE_PENDING_STOP: $1"
  exit 1
}

PENDING_FILE="logs/terminal-pending.json"

if [ ! -f "$PENDING_FILE" ]; then
  echo "PENDING_STATUS: none"
  echo "STALE_PENDING_OK"
  exit 0
fi

TMP_JSON="$(mktemp)"
cp "$PENDING_FILE" "$TMP_JSON"

PENDING_STATUS="$(python3 - "$TMP_JSON" <<'PY'
import sys, json
path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as f:
        j = json.load(f)
    print(j.get("status") or "")
except Exception:
    print("")
PY
)"

PENDING_CREATED_AT="$(python3 - "$TMP_JSON" <<'PY'
import sys, json
path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as f:
        j = json.load(f)
    print(j.get("createdAt") or "")
except Exception:
    print("")
PY
)"

rm -f "$TMP_JSON"

echo "PENDING_STATUS: ${PENDING_STATUS:-missing}"
echo "PENDING_CREATED_AT: ${PENDING_CREATED_AT:-missing}"
echo "MAX_ALLOWED_MINUTES: $MAX_PENDING_MINUTES"

[ -n "${PENDING_STATUS:-}" ] || fail "pending fail on vigane"
[ -n "${PENDING_CREATED_AT:-}" ] || fail "pending createdAt puudub"

PENDING_TS="$(python3 - "$PENDING_CREATED_AT" <<'PY'
import sys
from datetime import datetime, timezone
raw = sys.argv[1]
try:
    dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
    print(int(dt.timestamp()))
except Exception:
    print("")
PY
)"

[ -n "$PENDING_TS" ] || fail "pending aega ei saanud lugeda"

NOW_TS="$(date +%s)"
AGE_SECONDS=$((NOW_TS - PENDING_TS))
AGE_MINUTES=$((AGE_SECONDS / 60))

echo "PENDING_AGE_MINUTES: $AGE_MINUTES"

if [ "$AGE_MINUTES" -gt "$MAX_PENDING_MINUTES" ]; then
  fail "pending jääk on liiga vana"
fi

case "${PENDING_STATUS:-}" in
  pending)
    fail "aktiivne pending on ees, kinnita või puhasta enne jätkamist"
    ;;
  completed|confirmed|"")
    ;;
  *)
    fail "pending status ei ole turvaline: ${PENDING_STATUS}"
    ;;
esac

echo "STALE_PENDING_OK"
