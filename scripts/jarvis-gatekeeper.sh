#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "KASUTUS: ./scripts/jarvis-gatekeeper.sh <fail-või-kaust>"
  exit 2
fi

echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="
echo "===== JARVIS GATEKEEPER ====="
echo "TARGET=$TARGET"

[ -e "$TARGET" ] && echo "EXISTS_OK" || { echo "MISSING_TARGET"; exit 3; }

case "$TARGET" in
  scripts/archive/*|scripts/trash/*)
    echo "ZONE=NON_ACTIVE"
    ;;
  scripts/*|src/*)
    echo "ZONE=ACTIVE_CANDIDATE"
    ;;
  *)
    echo "ZONE=OTHER"
    ;;
esac

if echo "$TARGET" | grep -Eq '\.bak|tmp/|logs/|trash/'; then
  echo "RISK=DIRTY_OR_OLD"
else
  echo "RISK=CLEANER"
fi

if grep -Eq 'calendar|gmail|contacts|whatsapp|telegram|debug|voice' <<<"$TARGET"; then
  echo "RELEVANCE=HIGH"
else
  echo "RELEVANCE=LOW"
fi
