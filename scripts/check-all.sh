#!/bin/bash
set -euo pipefail

echo "===== DEV STATUS ====="
npm run dev:status

echo
echo "===== CORE SMOKE ====="
npm run smoke

echo
echo "===== GOOGLE SMOKE ====="
npm run smoke:google
