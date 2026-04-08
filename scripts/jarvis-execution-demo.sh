#!/bin/sh
set -eu

LABEL="${1:-demo-flow}"
TOTAL="${2:-3}"

echo "===== EXECUTION START ====="
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/start -H 'Content-Type: application/json' -d '{\"label\":\"$LABEL\",\"totalSteps\":$TOTAL}'"

echo
echo "===== EXECUTION STEP 1 ====="
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/step -H 'Content-Type: application/json' -d '{\"stepIndex\":1,\"stepLabel\":\"step 1\",\"stepStatus\":\"completed\"}'"

echo
echo "===== EXECUTION STEP 2 ====="
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/step -H 'Content-Type: application/json' -d '{\"stepIndex\":2,\"stepLabel\":\"step 2\",\"stepStatus\":\"completed\"}'"

echo
echo "===== EXECUTION COMPLETE ====="
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/complete -H 'Content-Type: application/json' -d '{\"stepLabel\":\"flow complete\"}'"

echo
echo "===== EXECUTION CHECK AFTER ====="
./scripts/jarvis-safe-copy-plain.sh execution_state_compact
