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
};

export type CreateCalendarEventInput = {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
};

export type UpdateCalendarEventInput = {
  titleQuery: string;
  start: string;
  end: string;
};

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

  return events.map((event) => mapGoogleEvent(event));
}

function mapGoogleEvent(event: calendar_v3.Schema$Event): CalendarEventItem {
  return {
    id: event.id ?? '',
    summary: event.summary ?? '(no title)',
    start: event.start?.dateTime || event.start?.date || '',
    end: event.end?.dateTime || event.end?.date || '',
    ...(event.location ? { location: event.location } : {}),
  };
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
  return events.map((event) => mapGoogleEvent(event));
}

/** Järgmised N päeva alates praegusest hetkest (primary kalender). */
export async function listUpcomingEventsWithinDays(days: number, maxResults = 80): Promise<CalendarEventItem[]> {
  const from = DateTime.now().setZone(DEFAULT_CALENDAR_TIMEZONE).toUTC();
  const to = from.plus({ days: Math.max(1, Math.min(days, 366)) });
  return listEventsInTimeRange(from.toISO()!, to.toISO()!, maxResults);
}

const MAX_BULK_DELETE = 60;

/** Kustuta kõik sündmused antud kalendripäevadel (üksikud instantsid, k.a korduvad lahti lõhutud). */
export async function deleteAllEventsOnCalendarDates(
  datesYmd: string[],
  timeZone = DEFAULT_CALENDAR_TIMEZONE,
): Promise<{ deleted: number; deletedIds: string[]; notes: string[] }> {
  const notes: string[] = [];
  const deletedIds: string[] = [];
  const seen = new Set<string>();

  for (const d of datesYmd) {
    const { timeMin, timeMax } = calendarDayToUtcRangeISO(d.trim(), timeZone);
    const events = await listEventsInTimeRange(timeMin, timeMax, 100);
    for (const ev of events) {
      if (!ev.id || seen.has(ev.id)) continue;
      if (deletedIds.length >= MAX_BULK_DELETE) {
        notes.push(`Kustutamise ülempiir (${MAX_BULK_DELETE}) saavutatud — järgmised jäid vahele.`);
        return { deleted: deletedIds.length, deletedIds, notes };
      }
      await deleteCalendarEventById(ev.id);
      seen.add(ev.id);
      deletedIds.push(ev.id);
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
  return mapGoogleEvent(event);
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

  return events.map((event) => mapGoogleEvent(event));
}

export async function createCalendarEvent(input: CreateCalendarEventInput) {

  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

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
