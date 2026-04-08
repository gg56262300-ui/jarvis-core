#!/bin/bash

while true
do
  clear
  echo "======================================"
  echo " JARVIS WATCHER AUTO-REFRESH"
  echo "======================================"
  echo
  date
  echo

  echo "===== 1. HEALTH ====="
  curl -s http://localhost:3000/health | python3 -m json.tool
  echo

  echo "===== 2. CALENDAR ====="
  curl -s http://localhost:3000/api/calendar/upcoming | python3 -m json.tool
  echo

  echo "===== 3. GMAIL: 5 VIIMAST ====="
  curl -s -X POST http://localhost:3000/api/voice/turns \
    -H "Content-Type: application/json; charset=utf-8" \
    --data '{"text":"näita 5 viimast kirja","locale":"et-EE","source":"text"}' | python3 -m json.tool
  echo

  echo "===== 4. GMAIL: LUGEMATA ====="
  curl -s -X POST http://localhost:3000/api/voice/turns \
    -H "Content-Type: application/json; charset=utf-8" \
    --data '{"text":"näita lugemata kirjad","locale":"et-EE","source":"text"}' | python3 -m json.tool
  echo

  echo "===== 5. GMAIL: AMAZON ====="
  curl -s -X POST http://localhost:3000/api/voice/turns \
    -H "Content-Type: application/json; charset=utf-8" \
    --data '{"text":"otsi kiri saatjalt Amazon","locale":"et-EE","source":"text"}' | python3 -m json.tool
  echo

  echo "===== UUS VÄRSKENDUS 15 SEK PÄRAST ====="
  sleep 15
done
