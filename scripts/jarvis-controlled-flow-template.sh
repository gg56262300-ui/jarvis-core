#!/bin/sh
set -eu

LABEL="${1:-controlled-template-flow}"
TOTAL="${2:-3}"
STEP1_CMD="${3:-curl -s http://localhost:3000/health}"
STEP1_LABEL="${4:-step 1}"
STEP2_CMD="${5:-curl -s http://localhost:3000/api/debug/control-summary-compact}"
STEP2_LABEL="${6:-step 2}"

echo "===== FLOW START ====="
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/start -H 'Content-Type: application/json' -d '{\"label\":\"$LABEL\",\"totalSteps\":$TOTAL}'"

echo
echo "===== FLOW STEP 1 ====="
./scripts/jarvis-copy-run.sh "$STEP1_CMD"
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/step -H 'Content-Type: application/json' -d '{\"stepIndex\":1,\"stepLabel\":\"$STEP1_LABEL\",\"stepStatus\":\"completed\"}'"

echo
echo "===== FLOW STEP 2 ====="
./scripts/jarvis-copy-run.sh "$STEP2_CMD"
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/step -H 'Content-Type: application/json' -d '{\"stepIndex\":2,\"stepLabel\":\"$STEP2_LABEL\",\"stepStatus\":\"completed\"}'"

echo
echo "===== FLOW COMPLETE ====="
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/complete -H 'Content-Type: application/json' -d '{\"stepLabel\":\"template flow complete\"}'"

echo
echo "===== FLOW FINAL CHECK ====="
./scripts/jarvis-safe-copy-plain.sh execution_state_compact
