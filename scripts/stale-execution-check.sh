#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

MAX_EXEC_MINUTES="${1:-30}"

echo "===== STALE EXECUTION CHECK ====="

fail() {
  echo
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
  echo "STALE_EXECUTION_STOP: $1"
  exit 1
}

STATE_FILE="logs/execution-state.json"

if [ ! -f "$STATE_FILE" ]; then
  echo "EXECUTION_STATUS: none"
  echo "STALE_EXECUTION_OK"
  exit 0
fi

TMP_JSON="$(mktemp)"
cp "$STATE_FILE" "$TMP_JSON"

EXEC_STATUS="$(python3 - "$TMP_JSON" <<'PY'
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

EXEC_UPDATED_AT="$(python3 - "$TMP_JSON" <<'PY'
import sys, json
path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as f:
        j = json.load(f)
    print(j.get("updatedAt") or j.get("createdAt") or "")
except Exception:
    print("")
PY
)"

EXEC_STEP="$(python3 - "$TMP_JSON" <<'PY'
import sys, json
path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as f:
        j = json.load(f)
    a = j.get("stepIndex")
    b = j.get("totalSteps")
    if a is None or b is None:
        print("")
    else:
        print(f"{a}/{b}")
except Exception:
    print("")
PY
)"

rm -f "$TMP_JSON"

echo "EXECUTION_STATUS: ${EXEC_STATUS:-missing}"
echo "EXECUTION_UPDATED_AT: ${EXEC_UPDATED_AT:-missing}"
echo "EXECUTION_STEP: ${EXEC_STEP:-missing}"
echo "MAX_ALLOWED_MINUTES: $MAX_EXEC_MINUTES"

case "${EXEC_STATUS:-}" in
  completed|failed|"")
    echo "STALE_EXECUTION_OK"
    exit 0
    ;;
  running|pending)
    ;;
  *)
    fail "execution status ei ole turvaline: ${EXEC_STATUS}"
    ;;
esac

[ -n "${EXEC_UPDATED_AT:-}" ] || fail "execution updatedAt puudub"

EXEC_TS="$(python3 - "$EXEC_UPDATED_AT" <<'PY'
import sys
from datetime import datetime
raw = sys.argv[1]
try:
    dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
    print(int(dt.timestamp()))
except Exception:
    print("")
PY
)"

[ -n "$EXEC_TS" ] || fail "execution aega ei saanud lugeda"

NOW_TS="$(date +%s)"
AGE_SECONDS=$((NOW_TS - EXEC_TS))
AGE_MINUTES=$((AGE_SECONDS / 60))

echo "EXECUTION_AGE_MINUTES: $AGE_MINUTES"

if [ "$AGE_MINUTES" -gt "$MAX_EXEC_MINUTES" ]; then
  fail "execution on liiga vana ja jäi pooleli"
fi

fail "execution on veel aktiivne (${EXEC_STATUS})"
