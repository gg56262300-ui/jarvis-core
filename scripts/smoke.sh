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

echo
echo "===== CHAT (lühike, brauseri kuupäev + tsoon nagu chat.html) ====="
CHAT_JSON="$(node -e "const d=new Date();const ymd=\`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}-\${String(d.getDate()).padStart(2,'0')}\`;console.log(JSON.stringify({message:'Ütle ainult sõna OK.',history:[],clientTimeZone:(typeof Intl!=='undefined'&&Intl.DateTimeFormat().resolvedOptions().timeZone)||'Europe/Tallinn',clientLocale:'et',clientLocalCalendarDate:ymd}))")"
curl --max-time 25 -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data "$CHAT_JSON" | python3 -m json.tool

echo
echo "===== CRM LEADS ====="
curl --max-time 8 -s "$BASE_URL/api/crm/leads" | python3 -m json.tool

echo
echo "===== GOOGLE (olek, ilma täisandmeteta) ====="
for path in "/api/gmail/inbox?limit=1" "/api/contacts/list" "/api/calendar/today"; do
  echo "--- GET $path ---"
  curl --max-time 12 -s "$BASE_URL$path" | python3 -c "import sys,json; d=json.load(sys.stdin); print('status:', d.get('status','?'))" || echo "parse error"
done
