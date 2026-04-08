#!/bin/sh
set -u

mkdir -p logs
OUT_TXT="logs/terminal-last.txt"
OUT_JSON="logs/terminal-last.json"
OUT_HISTORY="logs/terminal-history.ndjson"
PREV_TXT="logs/terminal-prev.txt"
PREV_JSON="logs/terminal-prev.json"

CMD="${*:-}"
TS="$(date '+%Y-%m-%d %H:%M:%S')"
PWD_NOW="$(pwd)"
TMP_OUT="$(mktemp)"
TMP_CLEAN="$(mktemp)"

if [ "$#" -gt 0 ]; then
  sh -c "$*" >"$TMP_OUT" 2>&1
  CODE=$?
else
  echo "(no command provided)" >"$TMP_OUT"
  CODE=0
fi

python3 - <<PY
import pathlib, re
raw = pathlib.Path("$TMP_OUT").read_text()
clean = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', raw)
pathlib.Path("$TMP_CLEAN").write_text(clean)
PY

if [ -f "$OUT_TXT" ]; then cp "$OUT_TXT" "$PREV_TXT"; fi
if [ -f "$OUT_JSON" ]; then cp "$OUT_JSON" "$PREV_JSON"; fi

{
  echo "===== TERMINAL CAPTURE ====="
  echo "time: $TS"
  echo "pwd: $PWD_NOW"
  echo "cmd: $CMD"
  echo "----- OUTPUT START -----"
  cat "$TMP_CLEAN"
  echo "----- OUTPUT END -----"
  echo "exit_code: $CODE"
} > "$OUT_TXT"

export JARVIS_CAPTURE_TIME="$TS"
export JARVIS_CAPTURE_PWD="$PWD_NOW"
export JARVIS_CAPTURE_CMD="$CMD"
export JARVIS_CAPTURE_CODE="$CODE"
export JARVIS_CAPTURE_CLEAN="$TMP_CLEAN"
export JARVIS_CAPTURE_JSON="$OUT_JSON"
export JARVIS_CAPTURE_HISTORY="$OUT_HISTORY"

python3 - <<'PY'
import json, os, pathlib

logs_dir = pathlib.Path("logs")
state_path = logs_dir / "terminal-state.json"
prev_state_path = logs_dir / "terminal-state-prev.json"

out = pathlib.Path(os.environ["JARVIS_CAPTURE_CLEAN"]).read_text()
exit_code = int(os.environ["JARVIS_CAPTURE_CODE"])

data = {
  "time": os.environ["JARVIS_CAPTURE_TIME"],
  "pwd": os.environ["JARVIS_CAPTURE_PWD"],
  "cmd": os.environ["JARVIS_CAPTURE_CMD"],
  "exit_code": exit_code,
  "output": out,
}

pathlib.Path(os.environ["JARVIS_CAPTURE_JSON"]).write_text(
  json.dumps(data, ensure_ascii=False, indent=2)
)

with pathlib.Path(os.environ["JARVIS_CAPTURE_HISTORY"]).open("a", encoding="utf-8") as f:
  f.write(json.dumps(data, ensure_ascii=False) + "\n")

if state_path.exists():
  prev_state_path.write_text(state_path.read_text())

terminal_state = {
  "ok": exit_code == 0,
  "stage": "direct_run",
  "id": "shell_capture",
  "status": "completed" if exit_code == 0 else "failed",
  "updatedAt": data["time"],
  "lastCapture": data,
}

if exit_code != 0:
  terminal_state["error"] = "CAPTURE_COMMAND_FAILED"

state_path.write_text(json.dumps(terminal_state, ensure_ascii=False, indent=2))
PY

rm -f "$TMP_OUT" "$TMP_CLEAN"
cat "$OUT_TXT"
exit "$CODE"
