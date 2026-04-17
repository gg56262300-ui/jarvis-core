import type { Request, Response } from 'express';
import OpenAI from 'openai';
import { env } from '../config/index.js';
import { createCalendarEvent, listUpcomingEvents } from '../modules/calendar/services/googleCalendar.service.js';
import { sendTelegramMessage } from '../integrations/telegram/telegram.client.js';
import { logger } from '../shared/logger/logger.js';

const ROBERT_SYSTEM_PROMPT = `Sa oled Robert — Kaido isiklik tehisintellekt-assistent. Sa oled tark, sõbralik ja konkreetne.

REEGLID:
- Vasta alati eesti keeles (va kui Kaido ise räägib teises keeles)
- Ole lühike ja konkreetne — mitte rohkem kui 2-3 lauset vastuses
- Kui saad käsu täita (kalender, meeldetuletus) — täida kohe, ära küsi üle
- Kui vajad täpsustust — küsi ühe konkreetse küsimusega
- Ole sõbralik nagu hea kolleeg

VÕIMED:
- Lisada sündmusi Google Calendari
- Vaadata kalendrit
- Pidada vestlust ja anda nõu
- Vastata küsimustele

KUUPÄEVAD: Täna on ${new Date().toLocaleDateString('et-EE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description: 'Lisa sündmus Google Calendari',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Sündmuse pealkiri' },
          start: { type: 'string', description: 'Algusaeg ISO 8601 formaadis, nt 2026-04-17T14:00:00+02:00' },
          end: { type: 'string', description: 'Lõpuaeg ISO 8601 formaadis, nt 2026-04-17T15:00:00+02:00' },
        },
        required: ['title', 'start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_calendar',
      description: 'Vaata Google Calendari sündmusi',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Mitu päeva ette vaadata (vaikimisi 7)' },
        },
        required: [],
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
      });
      void sendTelegramMessage(`✅ Kalendrisse lisatud:\n<b>${args.title}</b>\n🕐 ${args.start}`);
      return `Lisatud: ${result.id}`;
    } catch (err) {
      logger.error({ err }, 'chat: create_calendar_event failed');
      return `Viga: ${err instanceof Error ? err.message : 'teadmata'}`;
    }
  }

  if (name === 'query_calendar') {
    try {
      const events = await listUpcomingEvents(10);
      if (!events.length) return 'Kalendris pole lähiajal ühtegi sündmust.';
      return events
        .map((e) => {
          const start = typeof e.start === 'object' && e.start !== null
            ? ((e.start as Record<string, string>)['dateTime'] ?? (e.start as Record<string, string>)['date'] ?? '')
            : String(e.start ?? '');
          return `• ${e.summary ?? '(nimeta)'}: ${start}`;
        })
        .join('\n');
    } catch (err) {
      logger.error({ err }, 'chat: query_calendar failed');
      return `Viga kalendri lugemisel: ${err instanceof Error ? err.message : 'teadmata'}`;
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
