#!/bin/sh
set -eu

CHANGE="${1:-undefined change}"
RISK="${2:-unknown}"
BLOCK="${3:-unknown}"
PROOF="${4:-missing}"
BACKUP="${5:-no}"
CHAIN_SCOPE="${6:-unset}"
SOURCE_OF_TRUTH="${7:-unset}"
READ_ORDER="${8:-unset}"
WRITE_ORDER="${9:-unset}"
FRESHNESS_RULE="${10:-unset}"
VISIBLE_PROOF="${11:-unset}"

echo "===== JARVIS PRECHECK ====="
echo "MUUDATUS: $CHANGE"
echo "RISK: $RISK"
echo "PLOKI SUURUS: $BLOCK"
echo "TÕESTUS: $PROOF"
echo "BACKUP: $BACKUP"
echo "CHAIN_SCOPE: $CHAIN_SCOPE"
echo "SOURCE_OF_TRUTH: $SOURCE_OF_TRUTH"
echo "READ_ORDER: $READ_ORDER"
echo "WRITE_ORDER: $WRITE_ORDER"
echo "FRESHNESS_RULE: $FRESHNESS_RULE"
echo "VISIBLE_PROOF: $VISIBLE_PROOF"

DECISION="proceed"

if [ "$RISK" = "unknown" ] || [ "$PROOF" = "missing" ]; then
  DECISION="stop"
fi

if [ "$RISK" = "high" ] && [ "$BLOCK" != "small" ]; then
  DECISION="stop"
fi

if [ "$BACKUP" = "no" ] && [ "$RISK" != "low" ]; then
  DECISION="stop"
fi

case "$CHANGE" in
  *state*|*summary*|*output*|*flow*|*rollback*|*execution*|*capture*)
    [ "$CHAIN_SCOPE" = "full-chain" ] || DECISION="stop"
    [ "$SOURCE_OF_TRUTH" != "unset" ] || DECISION="stop"
    [ "$READ_ORDER" != "unset" ] || DECISION="stop"
    [ "$WRITE_ORDER" != "unset" ] || DECISION="stop"
    [ "$FRESHNESS_RULE" != "unset" ] || DECISION="stop"
    [ "$VISIBLE_PROOF" != "unset" ] || DECISION="stop"
    [ "$BACKUP" = "yes" ] || DECISION="stop"
    ;;
esac

echo "OTSUS: $DECISION"

if [ "$DECISION" = "stop" ]; then
  exit 1
fi
