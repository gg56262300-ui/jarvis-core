#!/bin/sh
set -eu

ID="${1:-}"
if [ -z "$ID" ]; then
  echo "USAGE: ./scripts/jarvis-safe-copy-plain.sh <safe_run_id>"
  exit 2
fi

OUT_DIR="${JARVIS_CLIP_DIR:-tmp}"
mkdir -p "$OUT_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
RAW_FILE="$OUT_DIR/jarvis-last-output.txt"
RAW_HIST="$OUT_DIR/jarvis-output-$STAMP.txt"
PLAIN_FILE="$OUT_DIR/jarvis-last-plain.txt"
PLAIN_HIST="$OUT_DIR/jarvis-plain-$STAMP.txt"

./scripts/terminal-safe-run.sh "$ID" 2>&1 | tee "$RAW_FILE" | tee "$RAW_HIST"

python3 - "$RAW_FILE" "$PLAIN_FILE" <<'PY'
from pathlib import Path
import sys

raw_path = Path(sys.argv[1])
plain_path = Path(sys.argv[2])

text = raw_path.read_text()
start_marker = "----- OUTPUT START -----"
end_marker = "----- OUTPUT END -----"

start = text.find(start_marker)
end = text.find(end_marker)

plain = ""
if start != -1 and end != -1 and end > start:
    plain = text[start + len(start_marker):end]

plain = plain.strip()
plain_path.write_text(plain + ("\n" if plain else ""))
print("PLAIN_EXTRACT_OK" if plain else "PLAIN_EXTRACT_EMPTY")
PY

cp "$PLAIN_FILE" "$PLAIN_HIST"
cat "$PLAIN_FILE" | pbcopy

echo
echo "===== PLAIN COPIED TO CLIPBOARD ====="
echo "$PLAIN_FILE"
echo "$PLAIN_HIST"
