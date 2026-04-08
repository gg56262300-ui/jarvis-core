import fs from 'node:fs/promises';
import path from 'node:path';

import { google } from 'googleapis';
import type { Credentials } from 'google-auth-library';

import { env } from '../../../config/index.js';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = path.join(process.cwd(), 'data/google-calendar-token.json');

export type CalendarEventItem = {
  id: string;
  summary: string;
  start: string;
  end: string;
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

export async function listUpcomingEvents(maxResults = 10): Promise<CalendarEventItem[]> {
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

  return events.map((event) => ({
    id: event.id ?? '',
    summary: event.summary ?? '(no title)',
    start: event.start?.dateTime || event.start?.date || '',
    end: event.end?.dateTime || event.end?.date || '',
  }));
}

export async function createCalendarEvent(input: CreateCalendarEventInput) {
  const auth = await createAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const result = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: input.title,
      description: input.description || undefined,
      location: input.location || undefined,
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
    id: event.id ?? '',
    summary: event.summary ?? input.title,
    start: event.start?.dateTime || event.start?.date || input.start,
    end: event.end?.dateTime || event.end?.date || input.end,
    htmlLink: event.htmlLink ?? '',
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
