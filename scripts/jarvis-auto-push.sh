#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

REPORT="$(./scripts/jarvis-auto-report.sh)"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "MISSING_TELEGRAM_ENV"
  printf '%s\n' "$REPORT"
  exit 0
fi

ESCAPED_REPORT="$(printf '%s' "$REPORT" | python3 - <<'PY'
import json, sys
print(json.dumps(sys.stdin.read()))
PY
)"

BODY="$(python3 - <<'PY' "$ESCAPED_REPORT"
import json, sys
report = json.loads(sys.argv[1])
payload = {
  "chat_id": __import__("os").environ["TELEGRAM_CHAT_ID"],
  "text": report[:4000],
}
print(json.dumps(payload))
PY
)"

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "$BODY" >/tmp/jarvis-telegram-send.json || true

echo "AUTO_PUSH_DONE"
printf '%s\n' "$REPORT"
echo
echo "TELEGRAM_SEND_RESULT"
cat /tmp/jarvis-telegram-send.json 2>/dev/null || echo "NO_SEND_RESULT"
