#!/usr/bin/env bash
# Üks käsk: kas kohalik Jarvis + tunnel + avalik URL vastavad (kestva kanali kontroll).
set -u

PUBLIC_BASE="${JARVIS_PUBLIC_BASE:-https://jarvis-kait.us}"
LOCAL_HEALTH="http://127.0.0.1:3000/health"
FAIL=0
COMPACT="${JARVIS_CHANNEL_CHECK_COMPACT:-0}"

if [ "$COMPACT" = "1" ]; then
  # pm2 may not exist on dev machines; keep it informative, not blocking.
  # Values: 1=OK, 0=FAIL, 2=NA (pm2 missing)
  pm2_jarvis_ok=1
  pm2_cloudflared_ok=1
  local_health_ok=1
  local_channel_ok=1
  pub_health_ok=1
  pub_channel_ok=1
  pub_ai_ok=1

  if ! command -v pm2 >/dev/null 2>&1; then
    pm2_jarvis_ok=2
    pm2_cloudflared_ok=2
  else
    pm2_json="$(pm2 jlist 2>&1)" || {
      if printf '%s' "$pm2_json" | grep -qiE 'EPERM|operation not permitted|connect EPERM'; then
        pm2_jarvis_ok=2
        pm2_cloudflared_ok=2
      else
        pm2_jarvis_ok=0
        pm2_cloudflared_ok=0
      fi
      pm2_json=""
    }
    if [ "$pm2_jarvis_ok" = "1" ] && [ -n "$pm2_json" ]; then
      printf '%s' "$pm2_json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
need = {'jarvis': False, 'cloudflared': False}
for a in data:
    n = (a.get('name') or '')
    st = (a.get('pm2_env', {}).get('status') or '')
    if n in need and st == 'online':
        need[n] = True
if not need['jarvis']:
    sys.exit(2)
if not need['cloudflared']:
    sys.exit(3)
" >/dev/null 2>&1 || {
        rc=$?
        if [ "$rc" = "2" ]; then pm2_jarvis_ok=0; fi
        if [ "$rc" = "3" ]; then pm2_cloudflared_ok=0; fi
      }
    fi
  fi

  curl -fsS --max-time 6 "$LOCAL_HEALTH" >/dev/null 2>&1 || local_health_ok=0
  curl -fsS --max-time 8 "http://127.0.0.1:3000/api/chat/channel?after=0&limit=5" >/dev/null 2>&1 || local_channel_ok=0
  curl -fsS --max-time 10 "${PUBLIC_BASE%/}/health" >/dev/null 2>&1 || pub_health_ok=0
  curl -fsS --max-time 12 "${PUBLIC_BASE%/}/api/chat/channel?after=0&limit=5" >/dev/null 2>&1 || pub_channel_ok=0

  payload='{"message":"Ütle üks sõna: test.","history":[],"clientTimeZone":"Europe/Tallinn","clientLocale":"et","clientLocalCalendarDate":"2026-04-20"}'
  out="$(curl -fsS --max-time 18 -H 'Content-Type: application/json' -d "$payload" "${PUBLIC_BASE%/}/api/chat" 2>/dev/null || true)"
  if ! printf '%s' "$out" | python3 -c "import json,sys; j=json.load(sys.stdin); assert isinstance(j.get('reply'), str) and j.get('reply').strip(); assert not j.get('degraded', False)" 2>/dev/null; then
    pub_ai_ok=0
  fi

  if [ "$local_health_ok" = "1" ] && [ "$local_channel_ok" = "1" ] && [ "$pub_health_ok" = "1" ] && [ "$pub_channel_ok" = "1" ] && [ "$pub_ai_ok" = "1" ] && { [ "$pm2_jarvis_ok" = "1" ] || [ "$pm2_jarvis_ok" = "2" ]; }; then
    printf '%s\n' "KOKKU: OK"
    exit 0
  fi
  pm2_jarvis_label="$pm2_jarvis_ok"
  pm2_cloudflared_label="$pm2_cloudflared_ok"
  if [ "$pm2_jarvis_ok" = "2" ]; then pm2_jarvis_label="NA"; fi
  if [ "$pm2_cloudflared_ok" = "2" ]; then pm2_cloudflared_label="NA"; fi
  printf '%s\n' "KOKKU: FAIL pm2Jarvis=$pm2_jarvis_label pm2Cloudflared=$pm2_cloudflared_label localHealth=$local_health_ok localChannel=$local_channel_ok pubHealth=$pub_health_ok pubChannel=$pub_channel_ok pubAI=$pub_ai_ok"
  exit 1
fi

printf '%s\n' "=== PM2: jarvis + cloudflared ==="
if ! command -v pm2 >/dev/null 2>&1; then
  printf '%s\n' "FAIL: pm2 puudub"
  exit 1
fi

python3 -c "
import json, subprocess, sys
data = json.loads(subprocess.check_output(['pm2', 'jlist'], text=True))
need = {'jarvis': False, 'cloudflared': False}
for a in data:
    n = (a.get('name') or '')
    st = (a.get('pm2_env', {}).get('status') or '')
    if n in need and st == 'online':
        need[n] = True
for k, v in need.items():
    print(f'  {k}: {\"OK\" if v else \"FAIL (pole online)\"}')
    if not v:
        sys.exit(1)
" || FAIL=1

printf '%s\n' "=== Kohalik health ==="
if ! out="$(curl -fsS --max-time 8 "$LOCAL_HEALTH" 2>&1)"; then
  printf '%s\n' "FAIL: $LOCAL_HEALTH — $out"
  FAIL=1
else
  printf '%s\n' "$out" | head -c 300
  printf '\nOK\n'
fi

CH_LOCAL="http://127.0.0.1:3000/api/chat/channel?after=0&limit=5"
printf '%s\n' "=== Kohalik chat-kanal (GET /api/chat/channel) ==="
if ! out="$(curl -fsS --max-time 10 "$CH_LOCAL" 2>&1)"; then
  printf '%s\n' "FAIL: $CH_LOCAL — $out"
  FAIL=1
else
  if ! printf '%s' "$out" | python3 -c "import json,sys; j=json.load(sys.stdin); assert j.get('ok') is True and isinstance(j.get('messages'), list)" 2>/dev/null; then
    printf '%s\n' "FAIL: $CH_LOCAL — ei ole korrektset JSON kanalit"
    FAIL=1
  else
    printf '%s\n' "$out" | head -c 400
    printf '\nOK\n'
  fi
fi

printf '%s\n' "=== Avalik health (${PUBLIC_BASE}) ==="
pub="${PUBLIC_BASE%/}/health"
if ! out="$(curl -fsS --max-time 15 "$pub" 2>&1)"; then
  printf '%s\n' "FAIL: $pub — $out"
  FAIL=1
else
  printf '%s\n' "$out" | head -c 300
  printf '\nOK\n'
fi

CH_PUB="${PUBLIC_BASE%/}/api/chat/channel?after=0&limit=5"
printf '%s\n' "=== Avalik chat-kanal (${CH_PUB}) ==="
if ! out="$(curl -fsS --max-time 18 "$CH_PUB" 2>&1)"; then
  printf '%s\n' "FAIL: $CH_PUB — $out"
  FAIL=1
else
  if ! printf '%s' "$out" | python3 -c "import json,sys; j=json.load(sys.stdin); assert j.get('ok') is True and isinstance(j.get('messages'), list)" 2>/dev/null; then
    printf '%s\n' "FAIL: $CH_PUB — ei ole korrektset JSON kanalit"
    FAIL=1
  else
    printf '%s\n' "$out" | head -c 400
    printf '\nOK\n'
  fi
fi

printf '%s\n' "=== Avalik AI (POST /api/chat, mitte degraded) ==="
CHAT_PUB="${PUBLIC_BASE%/}/api/chat"
payload='{"message":"Ütle üks sõna: test.","history":[],"clientTimeZone":"Europe/Tallinn","clientLocale":"et","clientLocalCalendarDate":"2026-04-20"}'
if ! out="$(curl -fsS --max-time 25 -H 'Content-Type: application/json' -d "$payload" "$CHAT_PUB" 2>&1)"; then
  printf '%s\n' "FAIL: $CHAT_PUB — $out"
  FAIL=1
else
  if ! printf '%s' "$out" | python3 -c "import json,sys; j=json.load(sys.stdin); assert isinstance(j.get('reply'), str) and j.get('reply').strip(); assert not j.get('degraded', False)" 2>/dev/null; then
    printf '%s\n' "FAIL: $CHAT_PUB — AI vastus on degraded või puudub reply"
    printf '%s\n' "$out" | head -c 250
    printf '\n'
    FAIL=1
  else
    printf '%s\n' "OK"
  fi
fi

if [ "$FAIL" -ne 0 ]; then
  printf '%s\n' "=== KOKKU: FAIL ==="
  exit 1
fi
printf '%s\n' "=== KOKKU: OK (PM2 + tunnel + avalik URL + AI) ==="
exit 0
