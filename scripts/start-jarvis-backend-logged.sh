#!/bin/bash
set -euo pipefail
cd ~/jarvis-core
mkdir -p logs
echo "======================================" | tee -a logs/jarvis-backend.log
echo " JARVIS BACKEND START $(date)" | tee -a logs/jarvis-backend.log
echo "======================================" | tee -a logs/jarvis-backend.log
npm run dev 2>&1 | tee -a logs/jarvis-backend.log
