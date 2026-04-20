#!/bin/sh
set -eu

unset npm_config_devdir 2>/dev/null || true

SCAN_DIR="${1:-.}"
node ./scripts/secrets-scan.mjs "$SCAN_DIR"

