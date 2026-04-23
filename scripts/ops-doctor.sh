#!/bin/bash
set -euo pipefail

BASE_URL="${JARVIS_BASE_URL:-http://127.0.0.1:3000}"

json_get() {
  local key="$1"
  node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);const k=process.argv[1];const v=j?.[k];process.stdout.write(v===undefined?"":String(v));}catch{process.stdout.write("")}})' "$key"
}

echo "===== OPS DOCTOR ====="

echo
echo "Backups:"
if [ -x "./scripts/backup-status.sh" ]; then
  backup_status_raw="$(./scripts/backup-status.sh 2>/dev/null || true)"
  if printf "%s" "$backup_status_raw" | grep -q 'BACKUP_STATUS=ok'; then
    latest_file="$(printf "%s" "$backup_status_raw" | awk -F= '/^LATEST_FILE=/{print $2}')"
    latest_time="$(printf "%s" "$backup_status_raw" | awk -F= '/^LATEST_TIME=/{print substr($0,13)}')"
    echo "- backup status: OK"
    [ -n "$latest_file" ] && echo "  latest: $latest_file"
    [ -n "$latest_time" ] && echo "  time:   $latest_time"
  else
    echo "- backup status: PROBLEM"
  fi
else
  echo "- backup status: script puudub"
fi

if [ -x "./scripts/backup-freshness-check.sh" ]; then
  backup_fresh_raw="$(./scripts/backup-freshness-check.sh 120 2>/dev/null || true)"
  if printf "%s" "$backup_fresh_raw" | grep -q '^FRESHNESS=ok'; then
    backup_age="$(printf "%s" "$backup_fresh_raw" | awk -F= '/^AGE_MINUTES=/{print $2}')"
    echo "- backup freshness: OK (${backup_age:-?} min)"
  elif printf "%s" "$backup_fresh_raw" | grep -q '^FRESHNESS=stale'; then
    backup_age="$(printf "%s" "$backup_fresh_raw" | awk -F= '/^AGE_MINUTES=/{print $2}')"
    echo "- backup freshness: STALE (${backup_age:-?} min)"
  else
    echo "- backup freshness: PROBLEM"
  fi
else
  echo "- backup freshness: script puudub"
fi

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
  local start_url="${3:-}"
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
      [ -n "$start_url" ] && echo "  start: $start_url"
      ;;
    "")
      echo "- $label: PROBLEM (ei saanud vastust)"
      ;;
    *)
      echo "- $label: $st"
      ;;
  esac
}

google_status_line "Gmail" "$BASE_URL/api/gmail/inbox?limit=1" "$BASE_URL/api/gmail/google/start"
google_status_line "Contacts" "$BASE_URL/api/contacts/list" "$BASE_URL/api/contacts/google/start"
google_status_line "Calendar" "$BASE_URL/api/calendar/today" "$BASE_URL/api/calendar/google/start"

echo
echo "Integratsioonid:"

make_result="$(curl -s -S --max-time 8 -X POST "$BASE_URL/api/integrations/make/test" 2>/dev/null || true)"
make_ok="$(printf "%s" "$make_result" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j?.ok===true && j?.makeDelivered===true ? "1":"0")}catch{process.stdout.write("0")}})')"
if [ "$make_ok" = "1" ]; then
  echo "- Make: OK"
else
  echo "- Make: PROBLEM (vaata /api/integrations/make/failed)"
fi

make_failed_summary="$(curl -s -S --max-time 8 "$BASE_URL/api/integrations/make/failed?limit=50" 2>/dev/null || true)"
make_kind_line="$(printf "%s" "$make_failed_summary" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);const s=j?.summary&&typeof j.summary==="object"?j.summary:{};const pairs=Object.entries(s);if(!pairs.length){process.stdout.write("");return;}pairs.sort((a,b)=>Number(b[1])-Number(a[1]));const [k,v]=pairs[0];process.stdout.write(String(k)+":"+String(v));}catch{process.stdout.write("")}})')"
if [ -n "$make_kind_line" ]; then
  echo "- Make failed top kind: $make_kind_line"
fi
make_nonretryable_count="$(curl -s -S --max-time 8 "$BASE_URL/api/integrations/make/failed?limit=50&retryable=false" 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(String(Number(j?.count)||0));}catch{process.stdout.write("0")}})')"
if [ "$make_nonretryable_count" != "0" ]; then
  echo "- Make non-retryable failures (last 50): $make_nonretryable_count"
fi
if [ "$make_ok" = "1" ]; then
  echo "- Make risk: 🟢 green (delivery OK)"
elif [ "$make_nonretryable_count" != "0" ]; then
  echo "- Make risk: 🔴 red (non-retryable failures found)"
else
  echo "- Make risk: 🟡 yellow (retryable failures only)"
fi

crm_result="$(curl -s -S --max-time 8 "$BASE_URL/api/crm/leads" 2>/dev/null || true)"
crm_ok="$(printf "%s" "$crm_result" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);const st=j?.status;const leads=j?.leads;const ready=st==="ready"||Array.isArray(leads);process.stdout.write(ready?"1":"0")}catch{process.stdout.write("0")}})')"
if [ "$crm_ok" = "1" ]; then
  echo "- CRM: OK"
else
  echo "- CRM: PROBLEM"
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
if [ "$health_status" = "ok" ] && [ "$make_ok" = "1" ] && [ "$crm_ok" = "1" ] && [ -n "$chat_reply" ]; then
  echo "🟢 Kõik põhiasjad paistavad korras."
  exit 0
fi
echo "🟡 Midagi vajab tähelepanu (vaata ülal)."
exit 1

