#!/usr/bin/env bash
# Üks käsk: kas kohalik Jarvis + tunnel + avalik URL vastavad (kestva kanali kontroll).
set -u

PUBLIC_BASE="${JARVIS_PUBLIC_BASE:-https://jarvis-kait.us}"
LOCAL_HEALTH="http://127.0.0.1:3000/health"
FAIL=0

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

CH_LOCAL="http://127.0.0.1:3000/api/chat/channel?after=0"
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

CH_PUB="${PUBLIC_BASE%/}/api/chat/channel?after=0"
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

if [ "$FAIL" -ne 0 ]; then
  printf '%s\n' "=== KOKKU: FAIL ==="
  exit 1
fi
printf '%s\n' "=== KOKKU: OK (kanal: PM2 + tunnel + avalik URL) ==="
exit 0
