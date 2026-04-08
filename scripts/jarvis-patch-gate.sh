#!/bin/sh
set -eu

CHANGE="${1:-}"
RISK="${2:-}"
BLOCK="${3:-}"
PROOF="${4:-}"
BACKUP="${5:-}"
CHAIN_SCOPE="${6:-}"
SOURCE_OF_TRUTH="${7:-}"
READ_ORDER="${8:-}"
WRITE_ORDER="${9:-}"
FRESHNESS_RULE="${10:-}"
VISIBLE_PROOF="${11:-}"

if [ -z "$CHANGE" ] || [ -z "$RISK" ] || [ -z "$BLOCK" ] || [ -z "$PROOF" ] || [ -z "$BACKUP" ] || [ -z "$CHAIN_SCOPE" ] || [ -z "$SOURCE_OF_TRUTH" ] || [ -z "$READ_ORDER" ] || [ -z "$WRITE_ORDER" ] || [ -z "$FRESHNESS_RULE" ] || [ -z "$VISIBLE_PROOF" ]; then
  echo "PATCH_GATE_STOP: missing required parameters"
  exit 1
fi

./scripts/jarvis-precheck.sh "$CHANGE" "$RISK" "$BLOCK" "$PROOF" "$BACKUP" "$CHAIN_SCOPE" "$SOURCE_OF_TRUTH" "$READ_ORDER" "$WRITE_ORDER" "$FRESHNESS_RULE" "$VISIBLE_PROOF"
