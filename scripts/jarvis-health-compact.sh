#!/bin/sh
set -eu

BASE_URL="${JARVIS_BASE_URL:-http://127.0.0.1:3000}"
PUBLIC_BASE="${JARVIS_PUBLIC_BASE:-https://jarvis-kait.us}"
COMPACT_CHANNEL="${JARVIS_CHANNEL_CHECK_COMPACT:-1}"
unset npm_config_devdir 2>/dev/null || true

health_ok=1
openai_ok=1
crm_ok=1
wa_ok=1
channel_ok=1

curl -fsS --max-time 6 "${BASE_URL%/}/health" >/dev/null 2>&1 || health_ok=0

if command -v npm >/dev/null 2>&1; then
  if ! npm run -s check:openai-auth >/dev/null 2>&1; then
    openai_ok=0
  fi
else
  openai_ok=0
fi

curl -fsS --max-time 6 "${BASE_URL%/}/api/crm/leads" >/dev/null 2>&1 || crm_ok=0
wa_raw="$(curl -fsS --max-time 6 "${BASE_URL%/}/api/whatsapp/health" 2>/dev/null || true)"
if [ -z "$wa_raw" ]; then
  wa_ok=0
else
  printf '%s' "$wa_raw" | python3 -c "import json,sys; j=json.load(sys.stdin); assert j.get('ok') is True" >/dev/null 2>&1 || wa_ok=0
fi

if command -v npm >/dev/null 2>&1; then
  if ! JARVIS_CHANNEL_CHECK_COMPACT="$COMPACT_CHANNEL" JARVIS_PUBLIC_BASE="$PUBLIC_BASE" npm run -s channel:check >/dev/null 2>&1; then
    channel_ok=0
  fi
else
  channel_ok=0
fi

if [ "$health_ok" = "1" ] && [ "$openai_ok" = "1" ] && [ "$crm_ok" = "1" ] && [ "$wa_ok" = "1" ] && [ "$channel_ok" = "1" ]; then
  echo "KOKKU: OK"
  exit 0
fi

echo "KOKKU: FAIL health=$health_ok openai=$openai_ok crm=$crm_ok whatsapp=$wa_ok channel=$channel_ok"
exit 1

