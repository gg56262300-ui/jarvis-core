#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
curl -s -X POST http://localhost:3000/api/debug/terminal-run/jarvis_snapshot >/dev/null
./scripts/jarvis-bridge-min-report.sh
