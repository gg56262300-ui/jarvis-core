import { readAgentInboxTail } from '../../agent-inbox/agent-inbox.service.js';
import { buildTelegramJarvisWorkflowGuide } from './jarvis-telegram-workflow-text.js';

/**
 * Telegrami «külgsuuna» käsud — töödeldakse enne Roberti LLM-i.
 * Uue käsu lisamiseks: lisa `handlers` massiivi `telegram-side-commands.ts` failis uus kirje (async handle → tekst või null).
 */
export type TelegramSideCommandHandler = {
  /** Logimiseks / silumiseks. */
  id: string;
  /** Tagastab vastuse teksti (saadetakse Telegramisse) või null, et jätkata LLM-iga. */
  handle: (raw: string) => Promise<string | null>;
};

const INBOX_REPLY_MAX = 3800;

async function formatInboxTailReply(): Promise<string> {
  const tail = await readAgentInboxTail(15);
  if (!tail.length) {
    return [
      'Agent-inbox: fail on tühi või puudub (`logs/agent-inbox.jsonl`).',
      'Telegrami sõnumid logitakse siiski, kui protsess saab faili kirjutada.',
    ].join('\n');
  }
  const lines = tail.map((e) => {
    const short = e.text.replace(/\s+/g, ' ').trim().slice(0, 220);
    return `${e.t} [${e.source}] ${short}`;
  });
  let body = ['Viimased agent-inbox read (server):', ...lines].join('\n');
  if (body.length > INBOX_REPLY_MAX) {
    body = `${body.slice(0, INBOX_REPLY_MAX - 1)}…`;
  }
  return body;
}

const pingReply = (): string =>
  [
    'Jarvis Telegram: webhook jõuab serverisse OK.',
    `Aeg: ${new Date().toISOString()}`,
    'Tavalised küsimused lähevad Roberti + OpenAI voogu (vajab OPENAI_API_KEY).',
    'Команда /ping не использует LLM — проверка доставки.',
  ].join('\n');

const handlers: TelegramSideCommandHandler[] = [
  {
    id: 'ping',
    async handle(raw: string): Promise<string | null> {
      const t = raw.trim();
      if (t === '/ping' || t === '/jarvis_ping') {
        return pingReply();
      }
      return null;
    },
  },
  {
    id: 'jarvis-workflow',
    async handle(raw: string): Promise<string | null> {
      const t = raw.trim();
      if (t === '/jarvis' || t === '/jarvis_help') {
        return buildTelegramJarvisWorkflowGuide();
      }
      return null;
    },
  },
  {
    id: 'inbox-tail',
    async handle(raw: string): Promise<string | null> {
      const t = raw.trim();
      if (t === '/inbox' || t === '/jarvis_inbox') {
        return formatInboxTailReply();
      }
      return null;
    },
  },
  // Lisa siia uusi { id, handle } — handle tagastab string | null.
];

export async function tryTelegramSideCommands(raw: string): Promise<string | null> {
  for (const h of handlers) {
    const out = await h.handle(raw);
    if (out !== null && out !== undefined) {
      return out;
    }
  }
  return null;
}
