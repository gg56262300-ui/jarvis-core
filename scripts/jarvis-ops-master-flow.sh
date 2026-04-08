#!/bin/sh
set -eu

LABEL="${1:-ops-master-flow}"

echo "===== FLOW START ====="
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/start -H 'Content-Type: application/json' -d '{\"label\":\"$LABEL\",\"totalSteps\":5}'"

echo
echo "===== FLOW STEP 1: HEALTH ====="
HEALTH_OUT="$(curl -s http://localhost:3000/health)"
printf '%s\n' "$HEALTH_OUT" | ./scripts/jarvis-copy-run.sh "cat"
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/step -H 'Content-Type: application/json' -d '{\"stepIndex\":1,\"stepLabel\":\"health checked\",\"stepStatus\":\"completed\"}'"

echo
echo "===== FLOW STEP 2: PM2 ====="
PM2_OUT="$(pm2 status jarvis)"
printf '%s\n' "$PM2_OUT" | ./scripts/jarvis-copy-run.sh "cat"
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/step -H 'Content-Type: application/json' -d '{\"stepIndex\":2,\"stepLabel\":\"pm2 checked\",\"stepStatus\":\"completed\"}'"

echo
echo "===== FLOW STEP 3: CONTROL SUMMARY ====="
./scripts/jarvis-safe-copy-plain.sh control_summary_compact
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/step -H 'Content-Type: application/json' -d '{\"stepIndex\":3,\"stepLabel\":\"control summary checked\",\"stepStatus\":\"completed\"}'"

echo
echo "===== FLOW STEP 4: EXECUTION COMPLETE ====="
./scripts/jarvis-copy-run.sh "curl -s -X POST http://localhost:3000/api/debug/execution/complete -H 'Content-Type: application/json' -d '{\"stepLabel\":\"ops master flow complete\"}'"

echo
echo "===== FLOW FINAL CHECK ====="
./scripts/jarvis-safe-copy-plain.sh execution_state_compact

echo
echo "===== FLOW STEP 5: HUMAN SUMMARY ====="
HEALTH_STATUS="$(printf '%s' "$HEALTH_OUT" | grep -q '"status":"ok"' && echo ok || echo fail)"
PM2_STATUS="$(printf '%s' "$PM2_OUT" | grep -q 'online' && echo online || echo problem)"
EXEC_JSON="$(cat tmp/jarvis-last-plain.txt)"
EXEC_STATUS="$(printf '%s' "$EXEC_JSON" | grep -o '"currentStatus":"[^"]*"' | head -n1 | cut -d':' -f2 | tr -d '"')"
EXEC_STEP="$(printf '%s' "$EXEC_JSON" | grep -o '"currentStepIndex":[0-9]*' | head -n1 | cut -d':' -f2)"
EXEC_TOTAL="$(printf '%s' "$EXEC_JSON" | grep -o '"currentTotalSteps":[0-9]*' | head -n1 | cut -d':' -f2)"
SUMMARY="Jarvis ops kokkuvõte: health=$HEALTH_STATUS, pm2=$PM2_STATUS, execution=$EXEC_STATUS ${EXEC_STEP}/${EXEC_TOTAL}."
printf '%s\n' "$SUMMARY" > tmp/jarvis-ops-summary.txt
pbcopy < tmp/jarvis-ops-summary.txt
cat tmp/jarvis-ops-summary.txt
