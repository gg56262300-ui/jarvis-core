#!/bin/bash
set -u

mkdir -p docs

DEV_OK="NO"
SMOKE_OK="NO"
FINAL_RESULT="WARN"
CLASSIFICATION="NOW"
WORKFLOW="PAUSE_AND_FIX"
REASON="Checks not completed"
ACTIVE_TASK=""
DONE_TASK="Agent control layer"

if npm run dev:status > docs/.agent_dev_status.tmp 2>&1; then
  DEV_OK="YES"
fi

if npm run smoke > docs/.agent_smoke.tmp 2>&1; then
  SMOKE_OK="YES"
fi

if [ "$DEV_OK" = "YES" ] && [ "$SMOKE_OK" = "YES" ]; then
  FINAL_RESULT="PASS"
  CLASSIFICATION="NEXT"
  WORKFLOW="CONTINUE"
  REASON="System healthy, continue current controlled workflow"
elif [ "$DEV_OK" = "YES" ] || [ "$SMOKE_OK" = "YES" ]; then
  FINAL_RESULT="WARN"
  CLASSIFICATION="NOW"
  WORKFLOW="PAUSE_AND_FIX"
  REASON="Partial validation only, fix current issue before continuing"
else
  FINAL_RESULT="FAIL"
  CLASSIFICATION="NOW"
  WORKFLOW="STOP_AND_FIX_NOW"
  REASON="Core validation failed"
fi

ACTIVE_TASK="$(awk '
  BEGIN { in_now=0 }
  /^## NOW$/ { in_now=1; next }
  /^## / { if (in_now) exit }
  in_now && /^- / { sub(/^- /, ""); print }
' docs/BACKLOG.md | tail -n 1)"

python3 - <<'PY' "$DONE_TASK" "$ACTIVE_TASK"
from pathlib import Path
import sys

done_task = sys.argv[1]
active_task = sys.argv[2]

p = Path("docs/BACKLOG.md")
text = p.read_text()
lines = text.splitlines()

now_items = []
next_items = []
later_items = []
done_items = []
section = None

for line in lines:
    if line == "## NOW":
      section = "NOW"
      continue
    if line == "## NEXT":
      section = "NEXT"
      continue
    if line == "## LATER":
      section = "LATER"
      continue
    if line == "## DONE":
      section = "DONE"
      continue
    if line.startswith("# "):
      continue

    if line.startswith("- "):
      item = line[2:]
      if section == "NOW":
        now_items.append(item)
      elif section == "NEXT":
        next_items.append(item)
      elif section == "LATER":
        later_items.append(item)
      elif section == "DONE":
        done_items.append(item)

now_items = [x for x in now_items if x != done_task]

if active_task:
    now_items = [x for x in now_items if x == active_task]

if done_task and done_task not in done_items:
    done_items.append(done_task)

def block(title, items):
    out = [title]
    if items:
        out.extend([f"- {x}" for x in items])
    return out

new_lines = ["# Jarvis Backlog", ""]
new_lines.extend(block("## NOW", now_items))
new_lines.append("")
new_lines.extend(block("## NEXT", next_items))
new_lines.append("")
new_lines.extend(block("## LATER", later_items))
new_lines.append("")
new_lines.extend(block("## DONE", done_items))
new_lines.append("")

p.write_text("\n".join(new_lines))
PY

if [ -n "$ACTIVE_TASK" ]; then
  printf "# Current Task\n\n- Goal: %s\n- Status: IN_PROGRESS\n- Mode: NOW\n" "$ACTIVE_TASK" > docs/CURRENT_TASK.md
fi

printf "# Last Result\n\n- Runtime: %s\n- Smoke: %s\n- Agent loop v7: %s\n" "$DEV_OK" "$SMOKE_OK" "$FINAL_RESULT" > docs/LAST_RESULT.md

printf "# Decision\n\n- Classification: %s\n- Workflow: %s\n- Reason: %s\n- Active task: %s\n- Done task: %s\n" "$CLASSIFICATION" "$WORKFLOW" "$REASON" "${ACTIVE_TASK:-NONE}" "$DONE_TASK" > docs/DECISION.md

{
  echo "# Agent Report"
  echo
  echo "## Current Task"
  cat docs/CURRENT_TASK.md
  echo
  echo "## Last Result"
  cat docs/LAST_RESULT.md
  echo
  echo "## Backlog"
  cat docs/BACKLOG.md
  echo
  echo "## Decision"
  cat docs/DECISION.md
  echo
  echo "## Dev Status"
  cat docs/.agent_dev_status.tmp
  echo
  echo "## Smoke"
  cat docs/.agent_smoke.tmp
  echo
  echo "## Final"
  echo "- Result: $FINAL_RESULT"
} > docs/AGENT_REPORT.md

rm -f docs/.agent_dev_status.tmp docs/.agent_smoke.tmp

echo "===== AGENT LOOP V7 DONE ====="
cat docs/CURRENT_TASK.md
echo
cat docs/BACKLOG.md
echo
cat docs/DECISION.md
echo
grep -n "Result:" docs/AGENT_REPORT.md
