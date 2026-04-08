#!/bin/bash
set -euo pipefail
cd ~/jarvis-core
mkdir -p logs

echo "======================================" | tee -a logs/jarvis-watcher.log
echo " JARVIS WATCHER START $(date)" | tee -a logs/jarvis-watcher.log
echo "======================================" | tee -a logs/jarvis-watcher.log
echo | tee -a logs/jarvis-watcher.log

echo "===== 1. HEALTH =====" | tee -a logs/jarvis-watcher.log
curl -s http://localhost:3000/health | python3 -m json.tool | tee -a logs/jarvis-watcher.log
echo | tee -a logs/jarvis-watcher.log

echo "===== 2. CALENDAR =====" | tee -a logs/jarvis-watcher.log
curl -s http://localhost:3000/api/calendar/upcoming | python3 -m json.tool | tee -a logs/jarvis-watcher.log
echo | tee -a logs/jarvis-watcher.log

echo "===== 3. GMAIL: 5 VIIMAST =====" | tee -a logs/jarvis-watcher.log
curl -s -X POST http://localhost:3000/api/voice/turns \
  -H "Content-Type: application/json; charset=utf-8" \
  --data '{"text":"näita 5 viimast kirja","locale":"et-EE","source":"text"}' | python3 -m json.tool | tee -a logs/jarvis-watcher.log
echo | tee -a logs/jarvis-watcher.log

echo "===== 4. GMAIL: LUGEMATA =====" | tee -a logs/jarvis-watcher.log
curl -s -X POST http://localhost:3000/api/voice/turns \
  -H "Content-Type: application/json; charset=utf-8" \
  --data '{"text":"näita lugemata kirjad","locale":"et-EE","source":"text"}' | python3 -m json.tool | tee -a logs/jarvis-watcher.log
echo | tee -a logs/jarvis-watcher.log

echo "===== 5. GMAIL: AMAZON =====" | tee -a logs/jarvis-watcher.log
curl -s -X POST http://localhost:3000/api/voice/turns \
  -H "Content-Type: application/json; charset=utf-8" \
  --data '{"text":"otsi kiri saatjalt Amazon","locale":"et-EE","source":"text"}' | python3 -m json.tool | tee -a logs/jarvis-watcher.log
echo | tee -a logs/jarvis-watcher.log

echo "===== LÕPP =====" | tee -a logs/jarvis-watcher.log
