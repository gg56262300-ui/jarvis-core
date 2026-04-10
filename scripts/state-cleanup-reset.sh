#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

MODE="${1:-dry-run}"

echo "===== STATE CLEANUP RESET ====="
echo "MODE: $MODE"

fail() {
  echo
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
  echo "STATE_CLEANUP_STOP: $1"
  exit 1
}

PENDING_FILE="logs/terminal-pending.json"
TERM_STATE="logs/terminal-state.json"
TERM_PREV="logs/terminal-state-prev.json"
EXEC_STATE="logs/execution-state.json"
EXEC_PREV="logs/execution-state-prev.json"

echo "STEP 0: SNAPSHOT"
for f in "$PENDING_FILE" "$TERM_STATE" "$TERM_PREV" "$EXEC_STATE" "$EXEC_PREV"; do
  if [ -f "$f" ]; then
    echo "FOUND: $f"
  else
    echo "MISSING: $f"
  fi
done

echo
echo "STEP 1: SAFETY CHECK"
./scripts/backup-freshness-check.sh 30

if [ "$MODE" = "dry-run" ]; then
  echo
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
  echo "STATE_CLEANUP_DRY_RUN_OK: cleanup preview valmis, midagi ei kustutatud"
  exit 0
fi

[ "$MODE" = "live" ] || fail "tundmatu mode: $MODE"

echo
printf "Type CLEANUP and press Enter to continue: "
read -r ANSWER

if [ "$ANSWER" != "CLEANUP" ]; then
  echo
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
  echo "STATE_CLEANUP_CANCELLED"
  exit 1
fi

echo
echo "STEP 2: CLEANUP"

rm -f "$PENDING_FILE"

python3 - <<'PY'
from pathlib import Path
import json
from datetime import datetime, timezone

now = datetime.now(timezone.utc).isoformat()

for path_str in ["logs/terminal-state.json", "logs/execution-state.json"]:
    p = Path(path_str)
    if not p.exists():
        continue
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    data["status"] = "completed"
    data["cleanupResetAt"] = now
    data["cleanupReset"] = True
    if "stage" in data and data.get("stage") == "pending":
        data["stage"] = "completed"
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print("JSON_RESET_OK")
PY

echo
echo "STEP 3: VERIFY"
PENDING_NOW="missing"
[ -f "$PENDING_FILE" ] && PENDING_NOW="still_exists"

echo "PENDING_AFTER: $PENDING_NOW"
./scripts/state-gate-check.sh || true
./scripts/stale-pending-check.sh 30 || true
./scripts/stale-execution-check.sh 30 || true

echo
echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="
echo "STATE_CLEANUP_OK"
