import fs from 'node:fs/promises';
import path from 'node:path';

import { DateTime } from 'luxon';
import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import type { Credentials } from 'google-auth-library';

import { env } from '../../../config/index.js';

const TOKEN_PATH = path.join(process.cwd(), 'data/google-calendar-token.json');

/** Vaikimisi Kaido ajavöönd; ülekirjutamiseks: JARVIS_CALENDAR_TIMEZONE */
export const DEFAULT_CALENDAR_TIMEZONE = process.env.JARVIS_CALENDAR_TIMEZONE ?? 'Europe/Tallinn';

export type CalendarEventItem = {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  /** Google: birthday, fromGmail, … */
  eventType?: string;
  /** Popup-meeldetuletused (minutid enne sündmuse algust); tühi = ainult e-post või puudub */
  reminderPopupOffsets?: number[];
};

export type CreateCalendarEventInput = {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  /** nt [10, 60] — Google Calendar popup enne algust */
  reminderPopupMinutes?: number[];
};

export type UpdateCalendarEventInput = {
  titleQuery: string;
  start: string;
  end: string;
};

let cachedPrimaryDefaultPopup: { fetchedAt: number; minutes: number[] } | null = null;
const PRIMARY_DEFAULT_CACHE_MS = 8 * 60 * 1000;

export async function getPrimaryDefaultPopupMinutes(): Promise<number[]> {
  if (cachedPrimaryDefaultPopup && Date.now() - cachedPrimaryDefaultPopup.fetchedAt < PRIMARY_DEFAULT_CACHE_MS) {
    return cachedPrimaryDefaultPopup.minutes;
  }
  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.calendarList.get({ calendarId: 'primary' });
  const dr = res.data.defaultReminders ?? [];
  const minutes = dr
    .filter((r) => r.method === 'popup' && typeof r.minutes === 'number')
    .map((r) => r.minutes as number);
  const resolved = minutes.length > 0 ? minutes : [10];
  cachedPrimaryDefaultPopup = { fetchedAt: Date.now(), minutes: resolved };
  return resolved;
}

function eventNeedsCalendarDefaultReminders(events: calendar_v3.Schema$Event[]): boolean {
  for (const e of events) {
    const r = e.reminders;
    if (!r) {
      return true;
    }
    if (r.overrides && r.overrides.length > 0) {
      continue;
    }
    if (r.useDefault === false) {
      continue;
    }
    return true;
  }
  return false;
}

export function mapGoogleEvent(event: calendar_v3.Schema$Event, defaultPopupMinutes: number[]): CalendarEventItem {
  const r = event.reminders;
  let reminderPopupOffsets: number[];
  if (r?.overrides && r.overrides.length > 0) {
    reminderPopupOffsets = r.overrides
      .filter((o) => o.method === 'popup' && typeof o.minutes === 'number')
      .map((o) => o.minutes as number);
  } else if (r?.useDefault === false && (!r.overrides || r.overrides.length === 0)) {
    reminderPopupOffsets = [];
  } else {
    reminderPopupOffsets = [...defaultPopupMinutes];
  }

  const eventType = typeof event.eventType === 'string' ? event.eventType : undefined;

  return {
    id: event.id ?? '',
    summary: event.summary ?? '(no title)',
    start: event.start?.dateTime || event.start?.date || '',
    end: event.end?.dateTime || event.end?.date || '',
    ...(event.location ? { location: event.location } : {}),
    ...(eventType ? { eventType } : {}),
    reminderPopupOffsets,
  };
}

export async function listUpcomingEvents(maxResults = 30): Promise<CalendarEventItem[]> {
  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const result = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = result.data.items ?? [];
  const defaultPopup = eventNeedsCalendarDefaultReminders(events) ? await getPrimaryDefaultPopupMinutes() : [];

  return events.map((event) => mapGoogleEvent(event, defaultPopup));
}

/** YYYY-MM-DD → UTC ISO vahemik (Luxon, Europe/Tallinn vaikimisi). */
export function calendarDayToUtcRangeISO(
  dateYmd: string,
  timeZone = DEFAULT_CALENDAR_TIMEZONE,
): { timeMin: string; timeMax: string } {
  const start = DateTime.fromISO(dateYmd, { zone: timeZone }).startOf('day');
  const end = DateTime.fromISO(dateYmd, { zone: timeZone }).endOf('day');
  if (!start.isValid || !end.isValid) {
    throw new Error(`Vigane kuupäev: ${dateYmd}`);
  }
  return { timeMin: start.toUTC().toISO()!, timeMax: end.toUTC().toISO()! };
}

/**
 * Sündmuse algus/lõpp millisekundites (kogu päeva sündmused: Google `date` → kohalik tsoon).
 */
export function calendarEventToMillisBounds(
  item: CalendarEventItem,
  timeZone = DEFAULT_CALENDAR_TIMEZONE,
): { startMs: number; endMs: number } | null {
  const s = item.start;
  const e = item.end || item.start;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const startDt = DateTime.fromISO(s, { zone: timeZone }).startOf('day');
    if (!startDt.isValid) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(e)) {
      const endExclusive = DateTime.fromISO(e, { zone: timeZone }).startOf('day');
      if (!endExclusive.isValid) {
        return null;
      }
      const endMs = endExclusive.toMillis() - 1;
      return { startMs: startDt.toMillis(), endMs };
    }
  }

  const startMs = new Date(s).getTime();
  const endMs = new Date(e).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }
  return { startMs, endMs };
}

/**
 * Google `events.list` filtreerib vaikimisi sündmuse *alguse* järgi — mitmepäevane või varem alanud
 * sündmus ei jõua kitsasse päevavahemikku. See funktsioon teeb laia päringu + kattuvuse kohalikus tsoonis.
 */
export async function listEventsOverlappingLocalInclusiveRange(
  dateFromYmd: string,
  dateToYmd: string,
  timeZone = DEFAULT_CALENDAR_TIMEZONE,
  options?: { maxApiResults?: number },
): Promise<CalendarEventItem[]> {
  const fromDay = DateTime.fromISO(dateFromYmd, { zone: timeZone }).startOf('day');
  const toDay = DateTime.fromISO(dateToYmd, { zone: timeZone }).endOf('day');
  if (!fromDay.isValid || !toDay.isValid || toDay < fromDay) {
    throw new Error(`Vigane kuupäevavahemik: ${dateFromYmd} … ${dateToYmd}`);
  }

  const padDays = 400;
  const timeMin = fromDay.minus({ days: padDays }).toUTC().toISO()!;
  const timeMax = toDay.plus({ days: 2 }).toUTC().toISO()!;
  const maxTotal = options?.maxApiResults ?? 8000;

  const raw = await listEventsInTimeRangePaginated(timeMin, timeMax, maxTotal);
  const rangeStartMs = fromDay.toMillis();
  const rangeEndMs = toDay.toMillis();

  return raw.filter((ev) => {
    const b = calendarEventToMillisBounds(ev, timeZone);
    if (!b) {
      return false;
    }
    return b.startMs <= rangeEndMs && b.endMs >= rangeStartMs;
  });
}

async function listEventsInTimeRangePaginated(
  timeMin: string,
  timeMax: string,
  maxTotal: number,
): Promise<CalendarEventItem[]> {
  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const defaultPopup = await getPrimaryDefaultPopupMinutes();

  const out: CalendarEventItem[] = [];
  let pageToken: string | undefined;

  while (out.length < maxTotal) {
    const remaining = maxTotal - out.length;
    const pageSize = Math.min(2500, remaining);
    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      maxResults: pageSize,
      singleEvents: true,
      orderBy: 'startTime',
      pageToken,
    });

    const events = result.data.items ?? [];
    for (const ev of events) {
      out.push(mapGoogleEvent(ev, defaultPopup));
    }
    pageToken = result.data.nextPageToken ?? undefined;
    if (!pageToken) {
      break;
    }
  }

  return out;
}

/** Sündmused vahemikus (RFC3339 timeMin/timeMax). */
export async function listEventsInTimeRange(
  timeMin: string,
  timeMax: string,
  maxResults = 100,
): Promise<CalendarEventItem[]> {
  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const result = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = result.data.items ?? [];
  const defaultPopup = eventNeedsCalendarDefaultReminders(events) ? await getPrimaryDefaultPopupMinutes() : [];
  return events.map((event) => mapGoogleEvent(event, defaultPopup));
}

/** Brauseri saadetud YYYY-MM-DD → selle kalendripäeva algus kohalikus vööndis (Luxon). */
function startOfLocalDayFromClientYmd(ymd: string, timeZone: string): DateTime | null {
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2100) return null;
  const dt = DateTime.fromObject({ year: y, month: mo, day: d }, { zone: timeZone }).startOf('day');
  return dt.isValid ? dt : null;
}

/**
 * Järgmised N kalendripäeva (primary kalender).
 * Kui `clientLocalTodayYmd` on olemas, alustatakse selle päeva keskööl (mitte ainult „nüüd“ hetkest) —
 * nii ei jää tänased hommikused sündmused pärastlõunal „upcoming“ loendist välja ja kuupäev ühtib brauseriga.
 */
export async function listUpcomingEventsWithinDays(
  days: number,
  maxResults = 80,
  timeZone: string = DEFAULT_CALENDAR_TIMEZONE,
  clientLocalTodayYmd?: string | null,
): Promise<CalendarEventItem[]> {
  const zonedNow = DateTime.now().setZone(timeZone);
  const fromClient = clientLocalTodayYmd ? startOfLocalDayFromClientYmd(clientLocalTodayYmd, timeZone) : null;
  const from = fromClient ?? zonedNow;
  const to = from.plus({ days: Math.max(1, Math.min(days, 366)) });
  return listEventsInTimeRange(from.toUTC().toISO()!, to.toUTC().toISO()!, maxResults);
}

/** Ühe päringu mass; kordame vooru kuni päeval pole enam kattuvaid sündmusi (palju testisündmusi). */
const MAX_BULK_DELETE_TOTAL = 800;

/** Kustuta kõik sündmused antud kalendripäevadel (üksikud instantsid, k.a korduvad lahti lõhutud). */
export async function deleteAllEventsOnCalendarDates(
  datesYmd: string[],
  timeZone = DEFAULT_CALENDAR_TIMEZONE,
): Promise<{ deleted: number; deletedIds: string[]; notes: string[] }> {
  const notes: string[] = [];
  const deletedIds: string[] = [];
  const seen = new Set<string>();

  for (const d of datesYmd) {
    const day = d.trim();
    let rounds = 0;
    while (rounds < 80) {
      rounds += 1;
      const events = await listEventsOverlappingLocalInclusiveRange(day, day, timeZone, { maxApiResults: 8000 });
      const pending = events.filter((ev) => ev.id && !seen.has(ev.id));
      if (!pending.length) {
        break;
      }
      for (const ev of pending) {
        if (deletedIds.length >= MAX_BULK_DELETE_TOTAL) {
          notes.push(
            `Kustutamise ülempiir (${MAX_BULK_DELETE_TOTAL}) saavutatud — sama päeva võib jätkata uue käsuga.`,
          );
          return { deleted: deletedIds.length, deletedIds, notes };
        }
        await deleteCalendarEventById(ev.id);
        seen.add(ev.id);
        deletedIds.push(ev.id);
      }
    }
    if (rounds >= 80) {
      notes.push(`Päeva ${day} kustutamise voorud said otsa — kontrolli kalendrit.`);
    }
  }

  return { deleted: deletedIds.length, deletedIds, notes };
}

export type PatchCalendarEventFields = {
  title?: string;
  location?: string;
  /** ISO dateTime või kogu päeva puhul YYYY-MM-DD */
  start?: string;
  end?: string;
};

export async function patchCalendarEventById(eventId: string, input: PatchCalendarEventFields): Promise<CalendarEventItem> {
  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const existing = await calendar.events.get({
    calendarId: 'primary',
    eventId,
  });

  const data = existing.data;
  const requestBody: calendar_v3.Schema$Event = {};

  if (input.title !== undefined) {
    requestBody.summary = input.title;
  }
  if (input.location !== undefined) {
    requestBody.location = input.location;
  }

  if (input.start !== undefined && input.end !== undefined) {
    const allDay = Boolean(data.start?.date && !data.start?.dateTime);
    if (allDay) {
      requestBody.start = { date: input.start.slice(0, 10) };
      requestBody.end = { date: input.end.slice(0, 10) };
    } else {
      requestBody.start = {
        dateTime: input.start,
        timeZone: DEFAULT_CALENDAR_TIMEZONE,
      };
      requestBody.end = {
        dateTime: input.end,
        timeZone: DEFAULT_CALENDAR_TIMEZONE,
      };
    }
  } else if (input.start !== undefined || input.end !== undefined) {
    throw new Error('Kalendrisündmuse muutmiseks vaja nii algus kui lõpp korraga.');
  }

  const result = await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody,
  });

  const event = result.data;
  const defaultPopup = await getPrimaryDefaultPopupMinutes();
  return mapGoogleEvent(event, defaultPopup);
}

/** Kas ajavahemikku [start,end] kattuvad olemasolevad sündmused (primary)? */
export async function listEventsOverlappingRange(
  startIso: string,
  endIso: string,
): Promise<CalendarEventItem[]> {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('Vigane ajavahemik overlap kontrolliks.');
  }

  const padMs = 60 * 1000;
  const timeMin = new Date(startMs - padMs).toISOString();
  const timeMax = new Date(endMs + padMs).toISOString();

  const candidates = await listEventsInTimeRange(timeMin, timeMax, 80);

  return candidates.filter((ev) => {
    const es = new Date(ev.start).getTime();
    const ee = new Date(ev.end).getTime();
    if (!Number.isFinite(es) || !Number.isFinite(ee)) {
      return false;
    }
    return es < endMs && ee > startMs;
  });
}

export async function listTodayEvents(maxResults = 50): Promise<CalendarEventItem[]> {
  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const result = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = result.data.items ?? [];
  const defaultPopup = eventNeedsCalendarDefaultReminders(events) ? await getPrimaryDefaultPopupMinutes() : [];

  return events.map((event) => mapGoogleEvent(event, defaultPopup));
}

export async function createCalendarEvent(input: CreateCalendarEventInput) {

  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const reminders =
    input.reminderPopupMinutes && input.reminderPopupMinutes.length > 0
      ? {
          useDefault: false,
          overrides: input.reminderPopupMinutes.map((minutes) => ({
            method: 'popup' as const,
            minutes,
          })),
        }
      : undefined;

  const insertResult = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: input.title,
      description: input.description || undefined,
      location: input.location || undefined,
      start: {
        dateTime: input.start,
        timeZone: DEFAULT_CALENDAR_TIMEZONE,
      },
      end: {
        dateTime: input.end,
        timeZone: DEFAULT_CALENDAR_TIMEZONE,
      },
      ...(reminders ? { reminders } : {}),
    },
  });

  const createdId = insertResult.data.id;

  if (!createdId) {
    throw new Error('Google Calendar insert returned no event id');
  }

  const verifyResult = await calendar.events.get({
    calendarId: 'primary',
    eventId: createdId,
  });

  const event = verifyResult.data;

  if (!event.id) {
    throw new Error('Google Calendar read-back verification failed');
  }

  return {
    id: event.id,
    summary: event.summary ?? input.title,
    start: event.start?.dateTime || event.start?.date || input.start,
    end: event.end?.dateTime || event.end?.date || input.end,
    htmlLink: event.htmlLink ?? '',
  };
}

export async function deleteCalendarEventById(eventId: string) {
  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  });
}

export async function updateCalendarEventById(input: {
  eventId: string;
  start: string;
  end: string;
}) {
  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const result = await calendar.events.patch({
    calendarId: 'primary',
    eventId: input.eventId,
    requestBody: {
      start: {
        dateTime: input.start,
      },
      end: {
        dateTime: input.end,
      },
    },
  });

  const event = result.data;

  return {
    id: event.id ?? input.eventId,
    summary: event.summary ?? '(no title)',
    start: event.start?.dateTime || event.start?.date || input.start,
    end: event.end?.dateTime || event.end?.date || input.end,
  };
}

export async function deleteUpcomingEventByTitle(titleQuery: string) {
  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const normalizedQuery = titleQuery.trim().toLowerCase();
  const events = await listUpcomingEvents(50);
  const match = events.find((event) => event.summary.trim().toLowerCase().includes(normalizedQuery));

  if (!match || !match.id) {
    return null;
  }

  await calendar.events.delete({
    calendarId: 'primary',
    eventId: match.id,
  });

  return match;
}

export async function updateUpcomingEventByTitle(input: UpdateCalendarEventInput) {
  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const normalizedQuery = input.titleQuery.trim().toLowerCase();
  const events = await listUpcomingEvents(50);
  const match = events.find((event) => event.summary.trim().toLowerCase().includes(normalizedQuery));

  if (!match || !match.id) {
    return null;
  }

  const result = await calendar.events.patch({
    calendarId: 'primary',
    eventId: match.id,
    requestBody: {
      start: {
        dateTime: input.start,
      },
      end: {
        dateTime: input.end,
      },
    },
  });

  const event = result.data;

  return {
    id: event.id ?? match.id,
    summary: event.summary ?? match.summary,
    start: event.start?.dateTime || event.start?.date || input.start,
    end: event.end?.dateTime || event.end?.date || input.end,
  };
}

async function createAuthorizedClient() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new Error(
      'Google OAuth keskkonnamuutujad puuduvad. Määra .env failis GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ja GOOGLE_REDIRECT_URI.',
    );
  }

  const fileContent = await fs.readFile(TOKEN_PATH, 'utf8');
  const token = JSON.parse(fileContent) as Credentials;
  const client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );

  client.setCredentials({
    ...token,
    access_token: token.access_token ?? undefined,
    refresh_token: token.refresh_token ?? undefined,
    scope: token.scope ?? undefined,
    token_type: token.token_type ?? undefined,
    expiry_date: token.expiry_date ?? undefined,
  });

  return client;
}
