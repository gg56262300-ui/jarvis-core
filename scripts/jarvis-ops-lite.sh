#!/bin/sh
set -eu

mkdir -p tmp
OUT="tmp/jarvis-ops-lite.txt"

HEALTH="$(curl -s http://localhost:3000/health || true)"
CONTROL="$(curl -s http://localhost:3000/api/debug/control-summary-compact || true)"
EXEC="$(curl -s http://localhost:3000/api/debug/execution-state-compact || true)"
PM2_JSON="$(pm2 jlist 2>/dev/null || true)"

export HEALTH CONTROL EXEC PM2_JSON OUT

python3 - <<'PY'
import json, os
from pathlib import Path

out_path = Path(os.environ["OUT"])

def load(raw: str):
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return raw

health = load(os.environ.get("HEALTH", ""))
control = load(os.environ.get("CONTROL", ""))
exec_state = load(os.environ.get("EXEC", ""))
pm2 = load(os.environ.get("PM2_JSON", ""))

health_status = "missing"
if isinstance(health, dict):
    health_status = str(health.get("status") or "missing")
elif isinstance(health, str) and health:
    health_status = " ".join(health.split())[:80]

pm2_status = "missing"
if isinstance(pm2, list):
    jarvis = next((x for x in pm2 if x.get("name") == "jarvis"), None)
    if jarvis:
        pm2_status = str((jarvis.get("pm2_env") or {}).get("status") or "missing")

control_stage = "missing"
control_exec = "missing"
control_cmd = "missing"
if isinstance(control, dict):
    summary = control.get("summary") or {}
    control_stage = str(summary.get("terminalStage") or "missing")
    control_exec = str(summary.get("executionStatus") or "missing")
    control_cmd = str(summary.get("terminalCommand") or "missing")

execution_summary = "missing"
if isinstance(exec_state, dict):
    cur = exec_state.get("currentStatus")
    step = exec_state.get("currentStepIndex")
    total = exec_state.get("currentTotalSteps")
    if cur is None and isinstance(exec_state.get("summary"), dict):
        s = exec_state["summary"]
        cur = s.get("currentStatus", s.get("status"))
        step = s.get("currentStepIndex", s.get("stepIndex"))
        total = s.get("currentTotalSteps", s.get("totalSteps"))
    execution_summary = f"status={cur}, step={step}/{total}"
elif isinstance(exec_state, str) and exec_state:
    execution_summary = " ".join(exec_state.split())[:300]

text = (
    "===== JARVIS OPS LITE =====\n"
    f"health: {health_status}\n"
    f"pm2: {pm2_status}\n"
    f"terminal_stage: {control_stage}\n"
    f"execution_from_control: {control_exec}\n"
    f"last_cmd: {control_cmd[:160]}\n"
    f"execution: {execution_summary}\n"
)

out_path.write_text(text, encoding="utf-8")
print(text, end="")
PY

pbcopy < "$OUT"
echo
echo "===== COPIED TO CLIPBOARD ====="
echo "$OUT"
