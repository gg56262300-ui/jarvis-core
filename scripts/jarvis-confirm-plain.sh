#!/bin/sh
set -eu

ID="${1:-health}"
BASE_URL="${JARVIS_BASE_URL:-http://localhost:3000}"
OUT_DIR="${JARVIS_CLIP_DIR:-tmp}"

mkdir -p "$OUT_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
RAW_FILE="$OUT_DIR/jarvis-confirm-last.json"
RAW_HIST="$OUT_DIR/jarvis-confirm-$STAMP.json"
PLAIN_FILE="$OUT_DIR/jarvis-confirm-last-plain.txt"
PLAIN_HIST="$OUT_DIR/jarvis-confirm-plain-$STAMP.txt"

REQ_JSON="$(curl -s -X POST "$BASE_URL/api/debug/terminal-request/$ID")"
REQ_ID="$(printf '%s' "$REQ_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["requestId"])')"
CONFIRM_JSON="$(curl -s -X POST "$BASE_URL/api/debug/terminal-confirm/$REQ_ID")"

printf '%s\n' "$CONFIRM_JSON" | tee "$RAW_FILE" > "$RAW_HIST"

POST_READ=""
case "$ID" in
  control_summary_compact)
    POST_READ="$(curl -s "$BASE_URL/api/debug/control-summary-compact" || true)"
    ;;
  execution_state_compact)
    POST_READ="$(curl -s "$BASE_URL/api/debug/execution-state-compact" || true)"
    ;;
esac

python3 - "$RAW_FILE" "$PLAIN_FILE" "$POST_READ" <<'PY'
from pathlib import Path
import json, sys

raw_path = Path(sys.argv[1])
plain_path = Path(sys.argv[2])
post_read = (sys.argv[3] or "").strip()

plain = ""

if post_read:
    plain = post_read

if not plain:
    raw = raw_path.read_text(encoding="utf-8").strip()
    if raw:
        try:
            j = json.loads(raw)
            last = j.get("lastCapture") or {}
            plain = (last.get("output") or "").strip()
        except Exception:
            plain = ""

plain_path.write_text(plain + ("\n" if plain else ""), encoding="utf-8")
print("PLAIN_EXTRACT_OK" if plain else "PLAIN_EXTRACT_EMPTY")
PY

cp "$PLAIN_FILE" "$PLAIN_HIST"
pbcopy < "$PLAIN_FILE"

echo "===== REQUEST ID ====="
echo "$REQ_ID"
echo
echo "===== PLAIN COPIED TO CLIPBOARD ====="
echo "$PLAIN_FILE"
echo "$PLAIN_HIST"
