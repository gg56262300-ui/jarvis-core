import { DateTime } from 'luxon';

import {
  DEFAULT_CALENDAR_TIMEZONE,
  listEventsInTimeRange,
  type CalendarEventItem,
} from '../modules/calendar/services/googleCalendar.service.js';
import { databaseProvider } from '../shared/database/index.js';

export type DueCalendarAlarm = {
  fireKey: string;
  eventId: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  alarmAtIso: string;
  /** -1 = sünnipäeva kogu päeva puhul kell 9:00 kohalik */
  reminderMinutesBefore: number;
  kind: 'birthday' | 'popup';
};

type EventWindow = { startMs: number; endMs: number };

function parseEventWindow(item: CalendarEventItem): EventWindow | null {
  const s = item.start;
  const e = item.end || item.start;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const startDt = DateTime.fromISO(s, { zone: DEFAULT_CALENDAR_TIMEZONE }).startOf('day');
    if (!startDt.isValid) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(e)) {
      const endExclusive = DateTime.fromISO(e, { zone: DEFAULT_CALENDAR_TIMEZONE }).startOf('day');
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

function isBirthdayLike(item: CalendarEventItem): boolean {
  if (item.eventType === 'birthday') {
    return true;
  }
  const t = item.summary ?? '';
  return /sünnipäev|synnipäev|birthday|день рождения|sünnas/i.test(t);
}

type AlarmSpec = { alarmAtMs: number; reminderMinutesBefore: number };

function buildAlarmSpecs(item: CalendarEventItem): AlarmSpec[] {
  const win = parseEventWindow(item);
  if (!win) {
    return [];
  }

  const offsets = item.reminderPopupOffsets ?? [];
  const bday = isBirthdayLike(item);
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(item.start);

  if (offsets.length > 0) {
    return offsets.map((minutes) => ({
      alarmAtMs: win.startMs - minutes * 60 * 1000,
      reminderMinutesBefore: minutes,
    }));
  }

  if (bday && allDay) {
    const nine = DateTime.fromISO(item.start, { zone: DEFAULT_CALENDAR_TIMEZONE }).set({
      hour: 9,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    if (!nine.isValid) {
      return [];
    }
    return [{ alarmAtMs: nine.toMillis(), reminderMinutesBefore: -1 }];
  }

  if (bday) {
    return [{ alarmAtMs: win.startMs, reminderMinutesBefore: 0 }];
  }

  return [];
}

function fireKey(eventId: string, alarmAtMs: number, suffix: string): string {
  return `${eventId}|${alarmAtMs}|${suffix}`;
}

type AckRow = { fire_key: string; dismissed_at: string | null; snooze_until: string | null };

function loadAckStates(fireKeys: string[]): Map<string, AckRow> {
  const map = new Map<string, AckRow>();
  if (fireKeys.length === 0) {
    return map;
  }

  const stmt = databaseProvider.prepare<{ fire_key: string }, AckRow>(
    'SELECT fire_key, dismissed_at, snooze_until FROM calendar_alarm_state WHERE fire_key = @fire_key',
  );

  for (const k of fireKeys) {
    const row = stmt.get({ fire_key: k });
    if (row) {
      map.set(k, row);
    }
  }
  return map;
}

/**
 * Sündmused, mille popup / sünnipäeva äratus on juba käes ja mida kasutaja pole veel Jah/Ei-ga lõpetanud.
 */
export async function listDueCalendarAlarms(): Promise<DueCalendarAlarm[]> {
  databaseProvider.initialize();

  const now = Date.now();
  const fromIso = new Date(now - 8 * 60 * 60 * 1000).toISOString();
  const toIso = new Date(now + 96 * 60 * 60 * 1000).toISOString();

  let events: CalendarEventItem[];
  try {
    events = await listEventsInTimeRange(fromIso, toIso, 150);
  } catch (err) {
    // Kui Google token puudub (ENOENT), ära tekita 500-spämmi – alarmid pole lihtsalt saadaval.
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT: no such file or directory/i.test(msg) && /google-calendar-token\.json/i.test(msg)) {
      return [];
    }
    throw err;
  }

  type Candidate = DueCalendarAlarm & { alarmAtMs: number; endMs: number };

  const candidates: Candidate[] = [];

  for (const ev of events) {
    if (!ev.id) {
      continue;
    }
    const win = parseEventWindow(ev);
    if (!win) {
      continue;
    }
    const specs = buildAlarmSpecs(ev);
    const bday = isBirthdayLike(ev);

    for (const spec of specs) {
      const suffix = spec.reminderMinutesBefore < 0 ? 'bday9' : `m${spec.reminderMinutesBefore}`;
      const fk = fireKey(ev.id, spec.alarmAtMs, suffix);
      const kind: DueCalendarAlarm['kind'] = bday ? 'birthday' : 'popup';
      candidates.push({
        fireKey: fk,
        eventId: ev.id,
        summary: ev.summary,
        start: ev.start,
        end: ev.end,
        ...(ev.location ? { location: ev.location } : {}),
        alarmAtIso: new Date(spec.alarmAtMs).toISOString(),
        reminderMinutesBefore: spec.reminderMinutesBefore,
        kind,
        alarmAtMs: spec.alarmAtMs,
        endMs: win.endMs,
      });
    }
  }

  const ackMap = loadAckStates(candidates.map((c) => c.fireKey));
  const graceAfterEventMs = 72 * 60 * 60 * 1000;
  const result: DueCalendarAlarm[] = [];

  for (const c of candidates) {
    if (c.alarmAtMs > now) {
      continue;
    }

    const until = c.endMs + graceAfterEventMs;
    if (now > until) {
      continue;
    }

    const state = ackMap.get(c.fireKey);
    if (state?.dismissed_at) {
      continue;
    }
    const snoozeUntil = state?.snooze_until ? new Date(state.snooze_until).getTime() : 0;
    if (snoozeUntil > now) {
      continue;
    }

    result.push({
      fireKey: c.fireKey,
      eventId: c.eventId,
      summary: c.summary,
      start: c.start,
      end: c.end,
      ...(c.location ? { location: c.location } : {}),
      alarmAtIso: c.alarmAtIso,
      reminderMinutesBefore: c.reminderMinutesBefore,
      kind: c.kind,
    });
  }

  result.sort((a, b) => a.alarmAtIso.localeCompare(b.alarmAtIso));
  return result;
}

export function ackCalendarAlarmDismiss(fireKey: string): void {
  databaseProvider.initialize();
  const d = new Date().toISOString();
  const stmt = databaseProvider.prepare<{ fire_key: string; dismissed_at: string }, unknown>(
    `INSERT INTO calendar_alarm_state (fire_key, dismissed_at, snooze_until)
     VALUES (@fire_key, @dismissed_at, NULL)
     ON CONFLICT(fire_key) DO UPDATE SET
       dismissed_at = excluded.dismissed_at,
       snooze_until = NULL`,
  );
  stmt.run({ fire_key: fireKey, dismissed_at: d });
}

export function ackCalendarAlarmSnooze(fireKey: string, snoozeMinutes: number): void {
  databaseProvider.initialize();
  const until = new Date(Date.now() + Math.max(1, snoozeMinutes) * 60 * 1000).toISOString();
  const stmt = databaseProvider.prepare<{ fire_key: string; snooze_until: string }, unknown>(
    `INSERT INTO calendar_alarm_state (fire_key, dismissed_at, snooze_until)
     VALUES (@fire_key, NULL, @snooze_until)
     ON CONFLICT(fire_key) DO UPDATE SET
       snooze_until = excluded.snooze_until,
       dismissed_at = NULL`,
  );
  stmt.run({ fire_key: fireKey, snooze_until: until });
}
