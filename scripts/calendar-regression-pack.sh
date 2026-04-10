#!/usr/bin/env bash
set -euo pipefail

TOKEN="$(pm2 jlist | python3 -c 'import json,sys; data=json.load(sys.stdin); apps=[a for a in data if a.get("name")=="jarvis"]; env=((apps[0].get("pm2_env",{}).get("env",{})) if apps else {}); print((env.get("JARVIS_BRIDGE_TOKEN") or "").strip())')"

run() {
  local text="$1"
  echo "----- TEST -----"
  echo "$text"
  curl -sS -X POST "http://localhost:3000/api/debug/bridge/calendar-write?token=$TOKEN" \
    -H 'Content-Type: application/json' \
    --data-raw "$(printf '{"text":"%s"}' "$(printf '%s' "$text" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])')")"
  echo
  echo
}

echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="
echo "===== CALENDAR REGRESSION PACK ====="
curl -fsS http://localhost:3000/health >/dev/null && echo "HEALTH_OK"
[ -n "$TOKEN" ] && echo "TOKEN_OK" || { echo "TOKEN_MISSING"; exit 2; }
echo

echo "----- PRE-CLEAN REG TEST EVENTS -----"
node --env-file=.env - <<'JS'
import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';

const TOKEN_PATH = path.join(process.cwd(), 'data/google-calendar-token.json');
const token = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);
auth.setCredentials(token);

const calendar = google.calendar({ version: 'v3', auth });
const targets = new Set(['REG TEST 1','REG TEST 2','REG TEST 3']);

const list = await calendar.events.list({
  calendarId: 'primary',
  timeMin: new Date().toISOString(),
  maxResults: 100,
  singleEvents: true,
  orderBy: 'startTime',
});

for (const e of (list.data.items ?? [])) {
  const summary = (e.summary ?? '').trim();
  if (targets.has(summary) && e.id) {
    await calendar.events.delete({ calendarId: 'primary', eventId: e.id });
    console.log('PRE-DELETED:', summary);
  }
}
JS
echo

run "homme kell 20 pane kalendrisse REG TEST 1"
run "laupäeval 11. kuupäeval kell 7 hommikul pane kalendrisse REG TEST 2"
run "pane kalendrisse homme kell 21 REG TEST 3"

echo "----- VERIFY -----"
curl -sS http://localhost:3000/api/calendar/upcoming
echo
echo "----- CLEANUP REG TEST EVENTS -----"
node --env-file=.env - <<'JS'
import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';

const TOKEN_PATH = path.join(process.cwd(), 'data/google-calendar-token.json');
const token = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);
auth.setCredentials(token);

const calendar = google.calendar({ version: 'v3', auth });
const targets = new Set(['REG TEST 1','REG TEST 2','REG TEST 3']);

const list = await calendar.events.list({
  calendarId: 'primary',
  timeMin: new Date().toISOString(),
  maxResults: 100,
  singleEvents: true,
  orderBy: 'startTime',
});

for (const e of (list.data.items ?? [])) {
  const summary = (e.summary ?? '').trim();
  if (targets.has(summary) && e.id) {
    await calendar.events.delete({ calendarId: 'primary', eventId: e.id });
    console.log('DELETED:', summary);
  }
}
JS
