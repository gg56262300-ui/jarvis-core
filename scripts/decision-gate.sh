#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ "${NO_COPY_MARKER:-0}" != "1" ]; then
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
fi

echo "===== DECISION GATE ====="

RAW="$(NO_COPY_MARKER=1 npm run --silent status:dashboard 2>/dev/null || true)"
printf '%s\n' "$RAW"

HAS_BACKUP_OK=0
HAS_STATE_OK=0
HAS_PENDING_OK=0
HAS_EXEC_OK=0
HAS_HEALTH_OK=0

printf '%s' "$RAW" | grep -q 'BACKUP_FRESHNESS_OK' && HAS_BACKUP_OK=1 || true
printf '%s' "$RAW" | grep -q 'STATE_GATE_OK' && HAS_STATE_OK=1 || true
printf '%s' "$RAW" | grep -q 'STALE_PENDING_OK' && HAS_PENDING_OK=1 || true
printf '%s' "$RAW" | grep -q 'STALE_EXECUTION_OK' && HAS_EXEC_OK=1 || true
printf '%s' "$RAW" | grep -q 'HEALTH_STATUS: ok' && HAS_HEALTH_OK=1 || true

echo
echo "===== DECISION ====="

if [ "$HAS_BACKUP_OK" -eq 1 ] && \
   [ "$HAS_STATE_OK" -eq 1 ] && \
   [ "$HAS_PENDING_OK" -eq 1 ] && \
   [ "$HAS_EXEC_OK" -eq 1 ] && \
   [ "$HAS_HEALTH_OK" -eq 1 ]; then
  echo "GO"
  echo "REASON: kõik põhigated on rohelised"
  exit 0
fi

echo "STOP"
echo "REASON: vähemalt üks põhigate ei ole roheline"
exit 1
