#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

echo "===== STATE GATE CHECK ====="

fail() {
  echo
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
  echo "STATE_GATE_STOP: $1"
  exit 1
}

RAW="$(curl -s http://127.0.0.1:3000/api/debug/execution-state-compact || true)"
[ -n "$RAW" ] || fail "execution-state-compact ei vastanud"

TMP_JSON="$(mktemp)"
printf '%s' "$RAW" > "$TMP_JSON"

CURRENT_STATUS="$(python3 - "$TMP_JSON" <<'PY'
import sys, json
path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as f:
        j = json.load(f)
    print(((j.get("summary") or {}).get("currentStatus")) or "")
except Exception:
    print("")
PY
)"

CURRENT_STEP="$(python3 - "$TMP_JSON" <<'PY'
import sys, json
path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as f:
        j = json.load(f)
    s = j.get("summary") or {}
    a = s.get("currentStepIndex")
    b = s.get("currentTotalSteps")
    if a is None or b is None:
        print("")
    else:
        print(f"{a}/{b}")
except Exception:
    print("")
PY
)"

rm -f "$TMP_JSON"

echo "CURRENT_STATUS: ${CURRENT_STATUS:-missing}"
echo "CURRENT_STEP: ${CURRENT_STEP:-missing}"

case "${CURRENT_STATUS:-}" in
  completed|"")
    ;;
  running|pending)
    fail "execution on veel pooleli (${CURRENT_STATUS})"
    ;;
  *)
    fail "execution status ei ole turvaline: ${CURRENT_STATUS}"
    ;;
esac

echo "STATE_GATE_OK"
