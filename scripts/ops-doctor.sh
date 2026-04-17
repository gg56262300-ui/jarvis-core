#!/bin/bash
set -euo pipefail

BASE_URL="${JARVIS_BASE_URL:-http://127.0.0.1:3000}"

json_get() {
  local key="$1"
  node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);const k=process.argv[1];const v=j?.[k];process.stdout.write(v===undefined?"":String(v));}catch{process.stdout.write("")}})' "$key"
}

echo "===== OPS DOCTOR ====="

health_json="$(curl -s -S --max-time 5 "$BASE_URL/health" || true)"
health_status="$(printf "%s" "$health_json" | json_get status)"
if [ "$health_status" = "ok" ]; then
  echo "Jarvis: OK"
else
  echo "Jarvis: PROBLEM"
fi

echo
echo "Google (Gmail / Contacts / Calendar):"

google_status_line() {
  local label="$1"
  local url="$2"
  local body
  body="$(curl -s -S --max-time 10 "$url" 2>/dev/null || true)"
  local st
  st="$(printf "%s" "$body" | json_get status)"
  case "$st" in
    ready)
      echo "- $label: OK"
      ;;
    authorization_required)
      echo "- $label: OAuth puudu (authorization_required)"
      ;;
    "")
      echo "- $label: PROBLEM (ei saanud vastust)"
      ;;
    *)
      echo "- $label: $st"
      ;;
  esac
}

google_status_line "Gmail" "$BASE_URL/api/gmail/inbox?limit=1"
google_status_line "Contacts" "$BASE_URL/api/contacts/list"
google_status_line "Calendar" "$BASE_URL/api/calendar/today"

echo
echo "Integratsioonid:"

make_result="$(curl -s -S --max-time 8 -X POST "$BASE_URL/api/integrations/make/test" 2>/dev/null || true)"
make_ok="$(printf "%s" "$make_result" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j?.ok===true && j?.makeDelivered===true ? "1":"0")}catch{process.stdout.write("0")}})')"
if [ "$make_ok" = "1" ]; then
  echo "- Make: OK"
else
  echo "- Make: PROBLEM (vaata /api/integrations/make/failed)"
fi

chat_result="$(curl -s -S --max-time 20 -X POST "$BASE_URL/api/chat" -H "Content-Type: application/json" -d '{"message":"Ütle ainult: OK","history":[]}' 2>/dev/null || true)"
chat_reply="$(printf "%s" "$chat_result" | json_get reply)"
if [ -n "$chat_reply" ]; then
  echo "- AI chat: OK"
else
  echo "- AI chat: PROBLEM"
fi

echo
echo "Autocheck:"
if [ -f "logs/autocheck-state.json" ]; then
  last_ok="$(node -e 'const fs=require("fs");try{const j=JSON.parse(fs.readFileSync("logs/autocheck-state.json","utf8"));process.stdout.write(String(Boolean(j.lastOk)))}catch{process.stdout.write("")}')"
  if [ "$last_ok" = "true" ]; then
    echo "- health jälgimine: OK"
  else
    echo "- health jälgimine: PROBLEM"
  fi
else
  echo "- health jälgimine: pole veel state faili"
fi

echo
echo "Kokkuvõte:"
if [ "$health_status" = "ok" ] && [ "$make_ok" = "1" ] && [ -n "$chat_reply" ]; then
  echo "🟢 Kõik põhiasjad paistavad korras."
  exit 0
fi
echo "🟡 Midagi vajab tähelepanu (vaata ülal)."
exit 1

