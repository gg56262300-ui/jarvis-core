#!/bin/bash
set -euo pipefail

BASE_URL="${JARVIS_BASE_URL:-http://127.0.0.1:3000}"

json_get() {
  local key="$1"
  node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);const k=process.argv[1];const v=j?.[k];process.stdout.write(v===undefined?"":String(v));}catch{process.stdout.write("")}})' "$key"
}

percent_line() {
  local label="$1"
  local pct="$2"
  local note="${3:-}"
  if [ -n "$note" ]; then
    printf "%-32s %3s%%  %s\n" "$label" "$pct" "$note"
  else
    printf "%-32s %3s%%\n" "$label" "$pct"
  fi
}

echo "===== OPS PROGRESS (0-100) ====="
echo "BASE_URL=$BASE_URL"
echo

health_json="$(curl -s -S --max-time 5 "$BASE_URL/health" 2>/dev/null || true)"
health_status="$(printf "%s" "$health_json" | json_get status)"
core_pct="10"
core_note="PROBLEM"
if [ "$health_status" = "ok" ]; then
  core_pct="95"
  core_note="OK"
fi
percent_line "Core service (/health)" "$core_pct" "$core_note"

channel_json="$(curl -s -S --max-time 8 "$BASE_URL/api/chat/channel?after=0&limit=1" 2>/dev/null || true)"
channel_ok="$(printf "%s" "$channel_json" | json_get ok)"
channel_pct="0"
channel_note="PROBLEM"
if [ "$channel_ok" = "true" ]; then
  channel_pct="100"
  channel_note="OK"
fi
percent_line "Chat channel (GET)" "$channel_pct" "$channel_note"

ai_json="$(curl -s -S --max-time 20 -X POST "$BASE_URL/api/chat" -H "Content-Type: application/json" -d '{"message":"Ütle ainult: OK","history":[]}' 2>/dev/null || true)"
ai_reply="$(printf "%s" "$ai_json" | json_get reply)"
ai_pct="0"
ai_note="PROBLEM"
if [ -n "$ai_reply" ]; then
  ai_pct="100"
  ai_note="OK"
fi
percent_line "AI chat (POST /api/chat)" "$ai_pct" "$ai_note"

make_test="$(curl -s -S --max-time 10 -X POST "$BASE_URL/api/integrations/make/test" 2>/dev/null || true)"
make_ok="$(printf "%s" "$make_test" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j?.ok===true && j?.makeDelivered===true ? "1":"0")}catch{process.stdout.write("0")}})')"
make_pct="40"
make_note="NEEDS_FIX"
if [ "$make_ok" = "1" ]; then
  make_pct="100"
  make_note="OK"
else
  make_failed="$(curl -s -S --max-time 10 "$BASE_URL/api/integrations/make/failed?limit=50" 2>/dev/null || true)"
  make_kind_line="$(printf "%s" "$make_failed" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);const s=j?.summary&&typeof j.summary==="object"?j.summary:{};const pairs=Object.entries(s);if(!pairs.length){process.stdout.write("");return;}pairs.sort((a,b)=>Number(b[1])-Number(a[1]));const [k,v]=pairs[0];process.stdout.write(String(k)+":"+String(v));}catch{process.stdout.write("")}})')"
  if [ -n "$make_kind_line" ]; then
    make_note="$make_note ($make_kind_line)"
  fi
fi
percent_line "Make (webhook delivery)" "$make_pct" "$make_note"

google_pct="10"
google_note="authorization_required"
gmail_status="$(curl -s -S --max-time 10 "$BASE_URL/api/gmail/inbox?limit=1" 2>/dev/null | json_get status || true)"
contacts_status="$(curl -s -S --max-time 10 "$BASE_URL/api/contacts/list" 2>/dev/null | json_get status || true)"
calendar_status="$(curl -s -S --max-time 10 "$BASE_URL/api/calendar/today" 2>/dev/null | json_get status || true)"

if [ "$gmail_status" = "ready" ] && [ "$contacts_status" = "ready" ] && [ "$calendar_status" = "ready" ]; then
  google_pct="100"
  google_note="OK"
elif [ "$gmail_status" = "" ] && [ "$contacts_status" = "" ] && [ "$calendar_status" = "" ]; then
  google_pct="0"
  google_note="PROBLEM"
fi
percent_line "Google (Gmail+Contacts+Cal)" "$google_pct" "$google_note"

backup_pct="0"
backup_note="missing"
if [ -x "./scripts/backup-status.sh" ] && [ -x "./scripts/backup-freshness-check.sh" ]; then
  backup_status_raw="$(./scripts/backup-status.sh 2>/dev/null || true)"
  backup_fresh_raw="$(./scripts/backup-freshness-check.sh 120 2>/dev/null || true)"
  if printf "%s" "$backup_status_raw" | grep -q 'BACKUP_STATUS=ok'; then
    if printf "%s" "$backup_fresh_raw" | grep -q '^FRESHNESS=ok'; then
      backup_pct="100"
      backup_note="OK"
    elif printf "%s" "$backup_fresh_raw" | grep -q '^FRESHNESS=stale'; then
      backup_pct="60"
      backup_note="STALE"
    else
      backup_pct="30"
      backup_note="PROBLEM"
    fi
  else
    backup_pct="10"
    backup_note="PROBLEM"
  fi
fi
percent_line "Backups (status+freshness)" "$backup_pct" "$backup_note"

autocheck_pct="0"
autocheck_note="missing_state"
if [ -f "logs/autocheck-state.json" ]; then
  last_ok="$(node -e 'const fs=require("fs");try{const j=JSON.parse(fs.readFileSync("logs/autocheck-state.json","utf8"));process.stdout.write(String(Boolean(j.lastOk)))}catch{process.stdout.write("")}')"
  if [ "$last_ok" = "true" ]; then
    autocheck_pct="100"
    autocheck_note="OK"
  else
    autocheck_pct="50"
    autocheck_note="has_state_but_not_ok"
  fi
fi
percent_line "Autocheck state" "$autocheck_pct" "$autocheck_note"

echo
echo "===== What to fix first ====="
echo "1) Make: fix MAKE_WEBHOOK_URL when kind is not_found_or_gone (404/410)."
echo "2) Google: complete OAuth once so status becomes ready."
echo "3) Backups: ensure backups/jarvis-core-*.zip või *.tar.gz on olemas ja freshness on OK."
echo
echo "===== Server RUN-pack ====="
echo "printf '\\033[1;42m========== KOPERI SIIT ==========\\033[0m\\n'"
echo "cd /root/jarvis-core"
echo "git pull"
echo "npm run ops:progress"
echo "npm run ops:doctor"
echo "curl -sS \"http://127.0.0.1:3000/api/integrations/make/failed?limit=5&retryable=false\" | head -c 2000"

