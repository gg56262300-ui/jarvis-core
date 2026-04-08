#!/bin/bash
set -u

mkdir -p docs

DEV_OK="NO"
SMOKE_OK="NO"
FINAL_RESULT="WARN"

if npm run dev:status > docs/.agent_dev_status.tmp 2>&1; then
  DEV_OK="YES"
fi

if npm run smoke > docs/.agent_smoke.tmp 2>&1; then
  SMOKE_OK="YES"
fi

if [ "$DEV_OK" = "YES" ] && [ "$SMOKE_OK" = "YES" ]; then
  FINAL_RESULT="PASS"
else
  FINAL_RESULT="WARN"
fi

printf "# Last Result\n\n- Runtime: %s\n- Smoke: %s\n- Agent loop v3: %s\n" "$DEV_OK" "$SMOKE_OK" "$FINAL_RESULT" > docs/LAST_RESULT.md

printf "# Decision\n\n- Classification: NOW\n- Workflow: CONTINUE\n- Reason: Agent loop v3 result = %s\n" "$FINAL_RESULT" > docs/DECISION.md

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

echo "===== AGENT LOOP V3 DONE ====="
cat docs/LAST_RESULT.md
echo
cat docs/DECISION.md
echo
cat docs/AGENT_REPORT.md
