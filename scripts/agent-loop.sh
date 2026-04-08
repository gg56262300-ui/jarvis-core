#!/bin/bash
set -euo pipefail

mkdir -p docs

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
  npm run dev:status
  echo
  echo "## Smoke"
  npm run smoke
  echo
  echo "## Final"
  echo "- Result: PASS"
} > docs/AGENT_REPORT.md 2>&1
