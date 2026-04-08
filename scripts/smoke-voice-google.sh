#!/bin/bash
set -euo pipefail

BASE_URL="http://localhost:3000"

echo "===== BUILD ====="
npm run build

echo
echo "===== VOICE GMAIL ====="
curl --max-time 10 -s -X POST "$BASE_URL/api/voice/turns" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data '{"text":"näita gmaili","locale":"et-EE","source":"text"}' | python3 -m json.tool

echo
echo "===== VOICE CALENDAR ====="
curl --max-time 10 -s -X POST "$BASE_URL/api/voice/turns" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data '{"text":"näita kalendrit","locale":"et-EE","source":"text"}' | python3 -m json.tool

echo
echo "===== VOICE CONTACTS ====="
curl --max-time 10 -s -X POST "$BASE_URL/api/voice/turns" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data '{"text":"näita kontaktid","locale":"et-EE","source":"text"}' | python3 -m json.tool
