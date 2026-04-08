#!/bin/sh
set -eu

LABEL="${1:-controlled-health-flow}"

echo "===== FLOW START ====="
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/start -H 'Content-Type: application/json' -d '{\"label\":\"$LABEL\",\"totalSteps\":3}'"

echo
echo "===== FLOW STEP 1: HEALTH ====="
./scripts/jarvis-copy-run.sh "curl -s http://localhost:3000/health"
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/step -H 'Content-Type: application/json' -d '{\"stepIndex\":1,\"stepLabel\":\"health checked\",\"stepStatus\":\"completed\"}'"

echo
echo "===== FLOW STEP 2: CONTROL SUMMARY ====="
./scripts/jarvis-safe-copy-plain.sh control_summary_compact
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/step -H 'Content-Type: application/json' -d '{\"stepIndex\":2,\"stepLabel\":\"control summary checked\",\"stepStatus\":\"completed\"}'"

echo
echo "===== FLOW STEP 3: EXECUTION COMPLETE ====="
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/complete -H 'Content-Type: application/json' -d '{\"stepLabel\":\"controlled flow complete\"}'"

echo
echo "===== FLOW FINAL CHECK ====="
./scripts/jarvis-safe-copy-plain.sh execution_state_compact
