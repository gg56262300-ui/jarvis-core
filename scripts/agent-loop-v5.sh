#!/bin/bash
set -u

mkdir -p docs

DEV_OK="NO"
SMOKE_OK="NO"
FINAL_RESULT="WARN"
CLASSIFICATION="NOW"
WORKFLOW="PAUSE_AND_FIX"
REASON="Checks not completed"
NEXT_TASK=""

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

NEXT_TASK="$(awk '
  BEGIN { in_next=0 }
  /^## NEXT$/ { in_next=1; next }
  /^## / { if (in_next) exit }
  in_next && /^- / { sub(/^- /, ""); print; exit }
' docs/BACKLOG.md)"

if [ "$FINAL_RESULT" = "PASS" ] && [ -n "$NEXT_TASK" ]; then
  printf "# Current Task\n\n- Goal: %s\n- Status: READY_TO_START\n- Mode: NEXT\n" "$NEXT_TASK" > docs/CURRENT_TASK.md
fi

printf "# Last Result\n\n- Runtime: %s\n- Smoke: %s\n- Agent loop v5: %s\n" "$DEV_OK" "$SMOKE_OK" "$FINAL_RESULT" > docs/LAST_RESULT.md

printf "# Decision\n\n- Classification: %s\n- Workflow: %s\n- Reason: %s\n- Next task: %s\n" "$CLASSIFICATION" "$WORKFLOW" "$REASON" "${NEXT_TASK:-NONE}" > docs/DECISION.md

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

echo "===== AGENT LOOP V5 DONE ====="
cat docs/CURRENT_TASK.md
echo
cat docs/DECISION.md
echo
grep -n "Result:" docs/AGENT_REPORT.md
