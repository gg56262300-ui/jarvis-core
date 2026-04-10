import fs from 'node:fs/promises';
import path from 'node:path';

import type { GaxiosError } from 'gaxios';
import { google } from 'googleapis';
import type { Credentials } from 'google-auth-library';

import { env } from '../config/index.js';
import { AppError } from '../shared/errors/app-error.js';
import { logger } from '../shared/logger/logger.js';
import {
  createCalendarEvent as createGoogleCalendarEvent,
  deleteUpcomingEventByTitle as deleteGoogleUpcomingEventByTitle,
  listTodayEvents as listGoogleTodayEvents,
  listUpcomingEvents as listGoogleUpcomingEvents,
  updateUpcomingEventByTitle as updateGoogleUpcomingEventByTitle,
} from '../modules/calendar/services/googleCalendar.service.js';
import { writeLastCalendarAction } from './calendarActionJournal.js';

export interface CalendarAuthorizationRequiredResult {
  status: 'authorization_required';
  responseText: string;
  authUrl: string;
  tokenPath: string;
}

export interface CalendarEventsReadyResult {
  status: 'ready';
  responseText: string;
  events: Array<{
    summary: string;
    startText: string;
  }>;
}

export type CalendarEventsResult =
  | CalendarAuthorizationRequiredResult
  | CalendarEventsReadyResult;

export interface CalendarCreateReadyResult {
  status: 'created';
  responseText: string;
  event: {
    id: string;
    summary: string;
    startText: string;
    endText: string;
    htmlLink: string;
  };
}

export type CalendarCreateResult =
  | CalendarAuthorizationRequiredResult
  | CalendarCreateReadyResult;

export interface CalendarDeleteReadyResult {
  status: 'deleted' | 'not_found';
  responseText: string;
  event?: {
    id: string;
    summary: string;
    startText: string;
    endText: string;
  };
}

export type CalendarDeleteResult =
  | CalendarAuthorizationRequiredResult
  | CalendarDeleteReadyResult;

export interface CalendarUpdateReadyResult {
  status: 'updated' | 'not_found';
  responseText: string;
  event?: {
    id: string;
    summary: string;
    startText: string;
    endText: string;
  };
}

export type CalendarUpdateResult =
  | CalendarAuthorizationRequiredResult
  | CalendarUpdateReadyResult;

export class CalendarService {
  private readonly tokenPath = path.resolve(process.cwd(), 'data/google-calendar-token.json');
  private readonly scopes = ['https://www.googleapis.com/auth/calendar'];

  async getAuthorizationUrl() {
    const client = await this.createOAuthClient();

    if (!client) {
      return this.buildConfigurationRequiredResult();
    }

    return {
      authUrl: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: this.scopes,
      }),
      tokenPath: this.tokenPath,
      instructions:
        'Ava see link brauseris, logi Google kontoga sisse ja kleebi tagasi saadud code väärtus POST /api/calendar/google/authorize päringusse.',
    };
  }

  async completeAuthorization(code: string) {
    const client = await this.createOAuthClient();

    if (!client) {
      return this.buildConfigurationRequiredResult();
    }

    let tokens: Credentials;

    try {
      const tokenResponse = await client.getToken(code.trim());
      tokens = tokenResponse.tokens;
    } catch (error) {
      throw this.toGoogleAuthorizationError(error);
    }

    await this.saveToken(tokens);

    return {
      status: 'authorized' as const,
      responseText: 'Google Calendar on nüüd kohalikus arenduses autoriseeritud.',
      tokenPath: this.tokenPath,
    };
  }

  async createEvent(input: {
    title: string;
    start: string;
    end: string;
    description?: string;
    location?: string;
  }): Promise<CalendarCreateResult> {
    try {
      const event = await createGoogleCalendarEvent(input);

      await writeLastCalendarAction({
        type: 'create',
        at: new Date().toISOString(),
        event: {
          id: event.id,
          summary: event.summary ?? input.title,
          start: event.start,
          end: event.end,
        },
      });

      return {
        status: 'created',
        responseText: `Kalendrisse lisatud: ${event.summary}. Algus ${this.formatEventStart(event.start)}.`,
        event: {
          id: event.id,
          summary: event.summary,
          startText: this.formatEventStart(event.start),
          endText: this.formatEventStart(event.end),
          htmlLink: event.htmlLink,
        },
      };
    } catch (error) {
      logger.warn({ err: error }, 'Google Calendar create event failed');

      const client = await this.createOAuthClient();
      return client ? this.buildAuthorizationRequiredResult(client) : this.buildConfigurationRequiredResult();
    }
  }

  async updateUpcomingEventByTitle(input: {
    titleQuery: string;
    start: string;
    end: string;
  }): Promise<CalendarUpdateResult> {
    try {
      const beforeEvents = await listGoogleUpcomingEvents(50);
      const beforeMatch = beforeEvents.find((item) =>
        (item.summary ?? '').trim().toLowerCase().includes(input.titleQuery.trim().toLowerCase()),
      );

      const event = await updateGoogleUpcomingEventByTitle(input);

      if (!event) {
        return {
          status: 'not_found',
          responseText: `Kalendrist ei leitud tulevast sündmust pealkirjaga: ${input.titleQuery}.`,
        };
      }

      await writeLastCalendarAction({
        type: 'update',
        at: new Date().toISOString(),
        before: {
          id: beforeMatch?.id ?? event.id,
          summary: beforeMatch?.summary ?? event.summary,
          start: beforeMatch?.start ?? event.start,
          end: beforeMatch?.end ?? event.end,
        },
        after: {
          id: event.id,
          summary: event.summary,
          start: event.start,
          end: event.end,
        },
      });

      return {
        status: 'updated',
        responseText: `Kalendris muudetud: ${event.summary}. Uus algus ${this.formatEventStart(event.start)}.`,
        event: {
          id: event.id,
          summary: event.summary,
          startText: this.formatEventStart(event.start),
          endText: this.formatEventStart(event.end),
        },
      };
    } catch (error) {
      logger.warn({ err: error }, 'Google Calendar update event failed');

      const client = await this.createOAuthClient();
      return client ? this.buildAuthorizationRequiredResult(client) : this.buildConfigurationRequiredResult();
    }
  }

  async deleteUpcomingEventByTitle(titleQuery: string): Promise<CalendarDeleteResult> {
    try {
      const event = await deleteGoogleUpcomingEventByTitle(titleQuery);

      if (!event) {
        return {
          status: 'not_found',
          responseText: `Kalendrist ei leitud tulevast sündmust pealkirjaga: ${titleQuery}.`,
        };
      }

      await writeLastCalendarAction({
        type: 'delete',
        at: new Date().toISOString(),
        event: {
          id: event.id,
          summary: event.summary,
          start: event.start,
          end: event.end,
        },
      });

      return {
        status: 'deleted',
        responseText: `Kalendrist kustutatud: ${event.summary}. Algus ${this.formatEventStart(event.start)}.`,
        event: {
          id: event.id,
          summary: event.summary,
          startText: this.formatEventStart(event.start),
          endText: this.formatEventStart(event.end),
        },
      };
    } catch (error) {
      logger.warn({ err: error }, 'Google Calendar delete event failed');

      const client = await this.createOAuthClient();
      return client ? this.buildAuthorizationRequiredResult(client) : this.buildConfigurationRequiredResult();
    }
  }

  async listUpcomingEvents(limit = 5): Promise<CalendarEventsResult> {
    try {
      const googleEvents = await listGoogleUpcomingEvents(limit);
      const events = googleEvents.map((item) => ({
        summary: item.summary?.trim() || 'Nimetu sündmus',
        startText: this.formatEventStart(item.start || null),
      }));

      if (events.length === 0) {
        return {
          status: 'ready',
          responseText: 'Sul ei ole lähiajal ühtegi tulevast kalendrisündmust.',
          events,
        };
      }

      const responseText = `Järgmised kalendrisündmused: ${events
        .map((event) => `${event.startText} ${event.summary}`)
        .join('; ')}.`;

      return {
        status: 'ready',
        responseText,
        events,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Google Calendar events request failed');

      const client = await this.createOAuthClient();
      return client ? this.buildAuthorizationRequiredResult(client) : this.buildConfigurationRequiredResult();
    }
  }

  async listTodayEvents(limit = 20): Promise<CalendarEventsResult> {
    try {
      const googleEvents = await listGoogleUpcomingEvents(50);
      const todayKey = this.getLocalDateKey(new Date());

      const events = googleEvents
        .filter((item) => this.getLocalDateKey(item.start || null) === todayKey)
        .slice(0, limit)
        .map((item) => ({
          summary: item.summary?.trim() || 'Nimetu sündmus',
          startText: this.formatEventStart(item.start || null),
        }));

      if (events.length === 0) {
        return {
          status: 'ready',
          responseText: 'Sul ei ole täna ühtegi kalendrisündmust.',
          events,
        };
      }

      const responseText = `Tänased kalendrisündmused: ${events
        .map((event) => `${event.startText} ${event.summary}`)
        .join('; ')}.`;

      return {
        status: 'ready',
        responseText,
        events,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Google Calendar today events request failed');

      const client = await this.createOAuthClient();
      return client ? this.buildAuthorizationRequiredResult(client) : this.buildConfigurationRequiredResult();
    }
  }

  async listAllTodayEvents(limit = 20): Promise<CalendarEventsResult> {
    try {
      const googleEvents = await listGoogleTodayEvents(50);

      const events = googleEvents.slice(0, limit).map((item) => ({
        summary: item.summary?.trim() || 'Nimetu sündmus',
        startText: this.formatEventStart(item.start || null),
      }));

      if (events.length === 0) {
        return {
          status: 'ready',
          responseText: 'Sul ei ole täna ühtegi kalendrisündmust.',
          events,
        };
      }

      const responseText = `Tänased kalendrisündmused: ${events
        .map((event) => `${event.startText} ${event.summary}`)
        .join('; ')}.`;

      return {
        status: 'ready',
        responseText,
        events,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Google Calendar all-today events request failed');

      const client = await this.createOAuthClient();
      return client ? this.buildAuthorizationRequiredResult(client) : this.buildConfigurationRequiredResult();
    }
  }

  private async createOAuthClient() {
    const credentials = this.readCredentials();

    if (!credentials) {
      return null;
    }

    const redirectUri = credentials.redirectUri;

    return new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      redirectUri,
    );
  }

  private readCredentials() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      return null;
    }

    return {
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    };
  }

  private async saveToken(token: Credentials) {
    await fs.mkdir(path.dirname(this.tokenPath), { recursive: true });
    await fs.writeFile(this.tokenPath, JSON.stringify(this.normalizeToken(token), null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.chmod(this.tokenPath, 0o600);
  }

  private buildAuthorizationRequiredResult(
    client: InstanceType<typeof google.auth.OAuth2>,
  ): CalendarAuthorizationRequiredResult {
    return {
      status: 'authorization_required',
      responseText:
        'Google Calendri kohalik autoriseerimine on veel tegemata. Ava /api/calendar/google/auth-url ja lõpeta autoriseerimine esmalt.',
      authUrl: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: this.scopes,
      }),
      tokenPath: this.tokenPath,
    };
  }

  private buildConfigurationRequiredResult(): CalendarAuthorizationRequiredResult {
    return {
      status: 'authorization_required',
      responseText:
        'Google Calendri OAuth seaded puuduvad. Määra .env failis GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ja GOOGLE_REDIRECT_URI.',
      authUrl: '',
      tokenPath: this.tokenPath,
    };
  }

  private getLocalDateKey(value: string | null | Date) {
    if (!value) {
      return null;
    }

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const date = value instanceof Date ? value : new Date(value);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private formatEventStart(startValue: string | null) {
    if (!startValue) {
      return 'Aeg puudub';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(startValue)) {
      const date = new Date(`${startValue}T00:00:00`);

      return new Intl.DateTimeFormat('et-EE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
    }

    return new Intl.DateTimeFormat('et-EE', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(startValue));
  }

  private normalizeToken(token: Credentials): Credentials {
    return {
      ...token,
      access_token: token.access_token ?? undefined,
      refresh_token: token.refresh_token ?? undefined,
      scope: token.scope ?? undefined,
      token_type: token.token_type ?? undefined,
      expiry_date: token.expiry_date ?? undefined,
    };
  }

  private toGoogleAuthorizationError(error: unknown): AppError {
    logger.warn({ err: error }, 'Google Calendar token exchange failed');

    const gaxiosError = error as GaxiosError<{
      error?: string;
      error_description?: string;
    }>;
    const googleError = gaxiosError.response?.data?.error;
    const googleDescription = gaxiosError.response?.data?.error_description?.toLowerCase() ?? '';
    const message = `${gaxiosError.message ?? ''} ${googleDescription}`.toLowerCase();
    const isInvalidCode =
      googleError === 'invalid_grant' ||
      message.includes('invalid_grant') ||
      message.includes('malformed auth code') ||
      message.includes('bad request');

    if (isInvalidCode) {
      return new AppError(
        'Google autoriseerimiskood on vigane, vales vormingus või aegunud. Loo uus kood Google logist ja proovi uuesti.',
        400,
        'GOOGLE_AUTHORIZATION_FAILED',
      );
    }

    return new AppError(
      'Google Calendri autoriseerimine ebaõnnestus. Palun loo uus autoriseerimiskood ja proovi uuesti.',
      400,
      'GOOGLE_AUTHORIZATION_FAILED',
    );
  }
}
