import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';

const TOKEN_PATH = path.join(process.cwd(), 'data/google-calendar-token.json');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
  console.error('MISSING_GOOGLE_ENV');
  process.exit(2);
}

const token = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));
const auth = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
);
auth.setCredentials(token);

const calendar = google.calendar({ version: 'v3', auth });

const timeMin = '2026-04-10T00:00:00+02:00';
const timeMax = '2026-04-12T00:00:00+02:00';

const list = await calendar.events.list({
  calendarId: 'primary',
  timeMin,
  timeMax,
  singleEvents: true,
  orderBy: 'startTime',
  maxResults: 250,
});

const items = list.data.items ?? [];
console.log('===== DELETE TARGETS =====');
for (const e of items) {
  const start = e.start?.dateTime || e.start?.date || '';
  console.log(`${e.id} | ${start} | ${e.summary ?? '(no title)'}`);
}

for (const e of items) {
  if (!e.id) continue;
  await calendar.events.delete({ calendarId: 'primary', eventId: e.id });
}

const verify = await calendar.events.list({
  calendarId: 'primary',
  timeMin,
  timeMax,
  singleEvents: true,
  orderBy: 'startTime',
  maxResults: 250,
});

console.log('\n===== VERIFY AFTER DELETE =====');
console.log(JSON.stringify(verify.data.items ?? [], null, 2));
