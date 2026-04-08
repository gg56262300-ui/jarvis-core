#!/bin/bash
set -euo pipefail

BASE_URL="http://localhost:3000"

echo "===== BUILD ====="
npm run build

echo
echo "===== HEALTH ====="
curl --max-time 5 -s "$BASE_URL/health" | python3 -m json.tool

echo
echo "===== JOBS ====="
curl --max-time 5 -s "$BASE_URL/api/jobs/status" | python3 -m json.tool

echo
echo "===== TIME ====="
curl --max-time 5 -s "$BASE_URL/api/time/now" | python3 -m json.tool

echo
echo "===== CALCULATOR ====="
curl --max-time 5 -s "$BASE_URL/api/calculator/eval?q=2%2B2*5" | python3 -m json.tool

echo
echo "===== VOICE TIME ====="
curl --max-time 10 -s -X POST "$BASE_URL/api/voice/turns" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data '{"text":"mis kell on","locale":"et-EE","source":"text"}' | python3 -m json.tool

echo
echo "===== VOICE DATE ====="
curl --max-time 10 -s -X POST "$BASE_URL/api/voice/turns" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data '{"text":"mis kuupäev täna on","locale":"et-EE","source":"text"}' | python3 -m json.tool

echo
echo "===== VOICE WEATHER ====="
curl --max-time 10 -s -X POST "$BASE_URL/api/voice/turns" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data '{"text":"mis ilm Calpes on","locale":"et-EE","source":"text"}' | python3 -m json.tool
