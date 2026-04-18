import type { Request, Response } from 'express';
import OpenAI from 'openai';
import { env } from '../config/index.js';
import {
  calendarDayToUtcRangeISO,
  createCalendarEvent,
  DEFAULT_CALENDAR_TIMEZONE,
  deleteAllEventsOnCalendarDates,
  deleteCalendarEventById,
  listEventsInTimeRange,
  listEventsOverlappingRange,
  listUpcomingEventsWithinDays,
  patchCalendarEventById,
  type CalendarEventItem,
} from '../modules/calendar/services/googleCalendar.service.js';
import { sendTelegramMessage } from '../integrations/telegram/telegram.client.js';
import { logger } from '../shared/logger/logger.js';

const ROBERT_SYSTEM_PROMPT = `Sa oled Robert — Kaido isiklik tehisintellekt-assistent. Sa oled tark, sõbralik ja konkreetne.

REEGLID:
- Vasta alati eesti keeles (va kui Kaido ise räägib teises keeles)
- Ole lühike ja konkreetne — mitte rohkem kui 2-3 lauset vastuses
- Kui saad käsu täita (kalender, meeldetuletus) — täida kohe tööriistadega; ära väljamõeldis, et midagi kustutatud oleks, kui tööriista ei kutsunud
- Masskustutuseks (nt "kõik 17. kuupäeva sündmused") kasuta delete_calendar_events koos dates massiiviga
- Enne uue sündmuse lisamist, kui kasutaja kardab kattumist, võid kasutada check_calendar_conflicts
- Kui vajad täpsustust — küsi ühe konkreetse küsimusega
- Ole sõbralik nagu hea kolleeg

VÕIMED:
- Google Calendar: lisada, vaadata vahemikku, kustutada (ID või terve päev), muuta pealkiri/asukohta/aega, kattuvuste kontroll
- Pidada vestlust ja anda nõu

AJAVÖÖND: Vaikimisi ${DEFAULT_CALENDAR_TIMEZONE}. Kuupäevad kujul YYYY-MM-DD tõlgendatakse selles tsoonis.

KUUPÄEVAD: Täna on ${new Date().toLocaleDateString('et-EE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;

function formatCalendarEventsForTool(events: CalendarEventItem[]): string {
  if (!events.length) {
    return 'Sündmusi ei leitud.';
  }
  return events
    .map((e) => {
      const loc = e.location ? ` | ${e.location}` : '';
      return `• id=${e.id} | ${e.summary} | ${e.start} → ${e.end}${loc}`;
    })
    .join('\n');
}

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description: 'Lisa sündmus Google Calendari (primary)',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Pealkiri' },
          start: { type: 'string', description: 'Algus ISO 8601, nt 2026-04-17T14:00:00+03:00' },
          end: { type: 'string', description: 'Lõpp ISO 8601' },
          location: { type: 'string', description: 'Asukoht (valikuline)' },
          description: { type: 'string', description: 'Kirjeldus (valikuline)' },
        },
        required: ['title', 'start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_calendar_events',
      description:
        'Loetle Google Calendari sündmusi. Kasuta upcoming_days (järgmised päevad praegusest) VÕI date_from kuni date_to (YYYY-MM-DD, kaasaarvatud).',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['upcoming_days', 'date_range'],
            description: 'upcoming_days = alates nüüd; date_range = kindlad kuupäevad',
          },
          upcoming_days: { type: 'number', description: 'Mitu päeva ette (nt 7), kui mode=upcoming_days' },
          date_from: { type: 'string', description: 'Alguskuupäev YYYY-MM-DD, kui mode=date_range' },
          date_to: { type: 'string', description: 'Lõppkuupäev YYYY-MM-DD, kui mode=date_range' },
        },
        required: ['mode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_calendar_events',
      description:
        'Kustuta sündmusi. Kasuta event_ids (üks või mitu Google event id) VÕI dates (terve päev tühjaks YYYY-MM-DD, mitu päeva korraga).',
      parameters: {
        type: 'object',
        properties: {
          event_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Google Calendar event id-d',
          },
          dates: {
            type: 'array',
            items: { type: 'string' },
            description: 'Kuupäevad YYYY-MM-DD — kustutatakse KÕIK sündmused neil päevadel',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_calendar_event',
      description:
        'Muuda olemasolevat sündmust (primary). Anna event_id (list_calendar_events väljundist). Võid muuta pealkirja, asukohta, algust ja lõppu korraga.',
      parameters: {
        type: 'object',
        properties: {
          event_id: { type: 'string', description: 'Google Calendar event id' },
          title: { type: 'string' },
          location: { type: 'string' },
          start: { type: 'string', description: 'Uus algus ISO; kui annad, peab ka end tulema' },
          end: { type: 'string', description: 'Uus lõpp ISO' },
        },
        required: ['event_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_calendar_conflicts',
      description: 'Kontrolli, kas antud ajavahemikus on juba sündmusi (kattuvus). Enne lisamist / ümberpaigutust.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Algus ISO 8601' },
          end: { type: 'string', description: 'Lõpp ISO 8601' },
        },
        required: ['start', 'end'],
      },
    },
  },
];

async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === 'create_calendar_event') {
    try {
      const result = await createCalendarEvent({
        title: args.title as string,
        start: args.start as string,
        end: args.end as string,
        description: typeof args.description === 'string' ? args.description : undefined,
        location: typeof args.location === 'string' ? args.location : undefined,
      });
      void sendTelegramMessage(`✅ Kalendrisse lisatud:\n<b>${args.title}</b>\n🕐 ${args.start}`);
      return `Lisatud id=${result.id}.`;
    } catch (err) {
      logger.error({ err }, 'chat: create_calendar_event failed');
      return `Viga: ${err instanceof Error ? err.message : 'teadmata'}`;
    }
  }

  if (name === 'list_calendar_events') {
    try {
      const mode = (args.mode as string) || 'upcoming_days';
      if (mode === 'date_range') {
        const from = String(args.date_from ?? '').trim();
        const to = String(args.date_to ?? '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
          return 'Viga: date_from ja date_to peavad olema YYYY-MM-DD.';
        }
        const tMin = calendarDayToUtcRangeISO(from).timeMin;
        const tMax = calendarDayToUtcRangeISO(to).timeMax;
        const events = await listEventsInTimeRange(tMin, tMax, 100);
        return formatCalendarEventsForTool(events);
      }
      const days = Math.min(120, Math.max(1, Number(args.upcoming_days) || 7));
      const events = await listUpcomingEventsWithinDays(days, 100);
      return formatCalendarEventsForTool(events);
    } catch (err) {
      logger.error({ err }, 'chat: list_calendar_events failed');
      return `Viga kalendri lugemisel: ${err instanceof Error ? err.message : 'teadmata'}`;
    }
  }

  if (name === 'delete_calendar_events') {
    try {
      const ids = args.event_ids as string[] | undefined;
      const dates = args.dates as string[] | undefined;

      if (dates?.length) {
        const clean = dates.map((d) => d.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
        if (!clean.length) {
          return 'Viga: dates peavad olema YYYY-MM-DD.';
        }
        const r = await deleteAllEventsOnCalendarDates(clean);
        const note = r.notes.length ? ` Märkus: ${r.notes.join(' ')}` : '';
        return `Kustutatud ${r.deleted} sündmust.${note}`;
      }

      if (ids?.length) {
        let n = 0;
        for (const id of ids.slice(0, 40)) {
          if (!id?.trim()) continue;
          await deleteCalendarEventById(id.trim());
          n += 1;
        }
        return `Kustutatud ${n} sündmust ID järgi.`;
      }

      return 'Puudu event_ids või dates.';
    } catch (err) {
      logger.error({ err }, 'chat: delete_calendar_events failed');
      return `Viga kustutamisel: ${err instanceof Error ? err.message : 'teadmata'}`;
    }
  }

  if (name === 'update_calendar_event') {
    try {
      const eventId = String(args.event_id ?? '').trim();
      if (!eventId) {
        return 'Puudu event_id.';
      }
      const patch: {
        title?: string;
        location?: string;
        start?: string;
        end?: string;
      } = {};
      if (typeof args.title === 'string') {
        patch.title = args.title;
      }
      if (typeof args.location === 'string') {
        patch.location = args.location;
      }
      if (typeof args.start === 'string' && typeof args.end === 'string') {
        patch.start = args.start;
        patch.end = args.end;
      } else if (typeof args.start === 'string' || typeof args.end === 'string') {
        return 'Kui muudad aega, anna nii start kui end korraga.';
      }

      if (!patch.title && !patch.location && !patch.start) {
        return 'Puudu muudatus (title, location või start+end).';
      }

      const updated = await patchCalendarEventById(eventId, patch);
      return `Uuendatud: ${updated.summary} | ${updated.start} → ${updated.end}`;
    } catch (err) {
      logger.error({ err }, 'chat: update_calendar_event failed');
      return `Viga uuendamisel: ${err instanceof Error ? err.message : 'teadmata'}`;
    }
  }

  if (name === 'check_calendar_conflicts') {
    try {
      const start = String(args.start ?? '').trim();
      const end = String(args.end ?? '').trim();
      const overlaps = await listEventsOverlappingRange(start, end);
      if (!overlaps.length) {
        return 'Selles ajavahemikus pole teisi sündmusi (või ei leitud kattuvusi).';
      }
      return `Kattuvad / samas vahemikus olevad sündmused:\n${formatCalendarEventsForTool(overlaps)}`;
    } catch (err) {
      logger.error({ err }, 'chat: check_calendar_conflicts failed');
      return `Viga: ${err instanceof Error ? err.message : 'teadmata'}`;
    }
  }

  return 'Tundmatu tööriist';
}

export async function handleChat(req: Request, res: Response) {
  const { message, history = [] } = req.body as {
    message: string;
    history: OpenAI.Chat.ChatCompletionMessageParam[];
  };

  if (!message?.trim()) {
    res.status(400).json({ error: 'message puudub' });
    return;
  }

  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ error: 'OpenAI API võti puudub' });
    return;
  }

  const openai = new OpenAI({ apiKey });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: ROBERT_SYSTEM_PROMPT },
    ...history.slice(-10),
    { role: 'user', content: message },
  ];

  try {
    let response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto',
    });

    let assistantMessage = response.choices[0].message;

    while (assistantMessage.tool_calls?.length) {
      messages.push(assistantMessage);

      for (const call of assistantMessage.tool_calls) {
        if (call.type !== 'function') continue;
        const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
        const result = await runTool(call.function.name, args);
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }

      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools,
        tool_choice: 'auto',
      });

      assistantMessage = response.choices[0].message;
    }

    res.json({ reply: assistantMessage.content ?? '' });
  } catch (err) {
    logger.error({ err }, 'chat: OpenAI error');
    res.status(500).json({ error: 'Viga AI vastuses' });
  }
}
