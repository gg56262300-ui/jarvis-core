#!/bin/sh
set -eu

OUT_DIR="${JARVIS_CLIP_DIR:-tmp}"
mkdir -p "$OUT_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/jarvis-last-output.txt"
HIST_FILE="$OUT_DIR/jarvis-output-$STAMP.txt"

if [ "$#" -eq 0 ]; then
  echo "USAGE: ./scripts/jarvis-copy-run.sh '<command>'"
  exit 2
fi

CMD="$*"

{
  echo "===== COMMAND ====="
  echo "$CMD"
  echo
  echo "===== OUTPUT ====="
  sh -lc "$CMD"
} 2>&1 | tee "$OUT_FILE" | tee "$HIST_FILE"

cat "$OUT_FILE" | pbcopy

echo
echo "===== COPIED TO CLIPBOARD ====="
echo "$OUT_FILE"
echo "$HIST_FILE"
