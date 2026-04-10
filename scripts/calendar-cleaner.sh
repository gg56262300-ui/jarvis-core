#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="
echo "===== CALENDAR CLEANER ====="

echo
echo "----- 1. DELETE TEST EVENTS -----"
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

const keepOut = new Set([
  'Helista Andresele',
  'Mine poodi, osta õlut ja vett',
  'Mine Konsumi, osta tomatifritot kuus purki',
  'Turg osta luku, lehti, pirni ja melonit',
]);

const testPrefixes = [
  'REG TEST',
  'SYS TEST',
  'AUDIT TEST',
  'GUARD TEST',
  'CAL VERIFY TEST',
  'JARVIS LOCAL CAL TEST',
  'BRIDGE CAL TEST',
  'LOCAL PATH TEST',
  'ROUNDTRIP TEST',
  'VOICE CAL TEST',
];

const list = await calendar.events.list({
  calendarId: 'primary',
  timeMin: new Date().toISOString(),
  maxResults: 250,
  singleEvents: true,
  orderBy: 'startTime',
});

const items = list.data.items ?? [];
let deleted = 0;

for (const e of items) {
  const summary = (e.summary ?? '').trim();
  if (!summary || keepOut.has(summary)) continue;
  if (testPrefixes.some(prefix => summary.startsWith(prefix)) && e.id) {
    await calendar.events.delete({ calendarId: 'primary', eventId: e.id });
    console.log('DELETED_EVENT:', summary);
    deleted += 1;
  }
}

console.log('DELETED_COUNT=' + deleted);
JS

echo
echo "----- 2. KEEP / REMOVE SCRIPT AUDIT -----"
printf '%s\n' \
"KEEP: scripts/jarvis-calendar.sh" \
"KEEP: scripts/calendar-preflight-and-guard.sh" \
"KEEP: scripts/calendar-regression-pack.sh" \
"KEEP: scripts/delete-calendar-range.js" \
"OPTIONAL_REMOVE_LATER: scripts/calendar-write-diagnostik.sh" \
"OPTIONAL_REMOVE_LATER: scripts/full-calendar-roundtrip.sh" \
"OPTIONAL_REMOVE_LATER: scripts/google-connector-blackbox-check.sh"

echo
echo "----- 3. CURRENT UPCOMING -----"
curl -sS http://localhost:3000/api/calendar/upcoming
