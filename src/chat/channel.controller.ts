import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { pushService } from '../push/push.service.js';
import { logger } from '../shared/logger/logger.js';

type ChatChannelMessage = {
  id: number;
  t: string;
  text: string;
  from?: 'assistant' | 'user';
};

const CHAT_CHANNEL_PATH = path.resolve(process.cwd(), 'logs', 'chat-channel.jsonl');
const MAX_TEXT_CHARS = 1200;
/** Max sõnumeid ühes GET vastuses (kaitse suurte payloadide vastu). */
const CHANNEL_GET_MAX_LIMIT = 100;
const CHANNEL_GET_DEFAULT_LIMIT = 50;
/** Loe kuni N rida faili lõpust (ülemine piir enne filtreerimist). */
const CHANNEL_READ_TAIL = 500;

function readBridgeToken(req: Request): string {
  const header = String(req.headers['x-jarvis-bridge-token'] ?? '').trim();
  if (header) return header;
  const auth = String(req.headers.authorization ?? '').trim();
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  return bearer;
}

function bridgeTokenOk(req: Request): boolean {
  const expected = String(process.env.JARVIS_BRIDGE_TOKEN ?? '').trim();
  if (!expected) return false;
  return readBridgeToken(req) === expected;
}

async function readMessagesTail(limit = 200): Promise<ChatChannelMessage[]> {
  try {
    const raw = await fs.readFile(CHAT_CHANNEL_PATH, 'utf8');
    const lines = raw.split('\n').filter((line) => line.trim() !== '');
    const slice = lines.slice(-Math.max(1, Math.min(limit, CHANNEL_READ_TAIL)));
    const out: ChatChannelMessage[] = [];
    for (const line of slice) {
      try {
        const parsed = JSON.parse(line) as Partial<ChatChannelMessage>;
        if (typeof parsed.id === 'number' && typeof parsed.text === 'string' && typeof parsed.t === 'string') {
          out.push({
            id: parsed.id,
            text: parsed.text,
            t: parsed.t,
            from: parsed.from === 'user' ? 'user' : parsed.from === 'assistant' ? 'assistant' : undefined,
          });
        }
      } catch {
        // ignore malformed row
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function appendChatChannelMessage(input: { text: string; from: 'assistant' | 'user' }) {
  const text = String(input.text ?? '').trim().slice(0, MAX_TEXT_CHARS);
  if (!text) return null;

  const id = Date.now();
  const message: ChatChannelMessage = {
    id,
    t: new Date().toISOString(),
    text,
    from: input.from,
  };

  await fs.mkdir(path.dirname(CHAT_CHANNEL_PATH), { recursive: true });
  await fs.appendFile(CHAT_CHANNEL_PATH, `${JSON.stringify(message)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return id;
}

export async function postChatChannelMessage(req: Request, res: Response) {
  if (!bridgeTokenOk(req)) {
    res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    return;
  }

  const text = String(req.body?.text ?? '');
  if (!text.trim()) {
    res.status(400).json({ ok: false, error: 'TEXT_REQUIRED' });
    return;
  }
  const id = await appendChatChannelMessage({ text, from: 'assistant' });

  // Ühe-kanali reegel: kui võimalik, peegelda assistendi kanalisõnum kohe pushina.
  // Nii jõuab info telefoni Notification Centerisse ka siis, kui avatud chat-view jääb toppama.
  void pushService.sendTestPing(text).catch((err) => {
    logger.warn({ err }, 'chat-channel: push mirror send failed');
  });

  res.json({ ok: true, id });
}

export async function postChatChannelUserMessage(req: Request, res: Response) {
  const text = String(req.body?.text ?? '');
  if (!text.trim()) {
    res.status(400).json({ ok: false, error: 'TEXT_REQUIRED' });
    return;
  }
  const id = await appendChatChannelMessage({ text, from: 'user' });
  res.json({ ok: true, id });
}

export async function getChatChannelMessages(req: Request, res: Response) {
  const afterRaw = Number(req.query.after ?? 0);
  let after = Number.isFinite(afterRaw) ? afterRaw : 0;
  if (after < 0) after = 0;

  const limitRaw = Number(req.query.limit ?? CHANNEL_GET_DEFAULT_LIMIT);
  let limit = Number.isFinite(limitRaw) ? Math.floor(limitRaw) : CHANNEL_GET_DEFAULT_LIMIT;
  if (limit < 1) limit = 1;
  if (limit > CHANNEL_GET_MAX_LIMIT) limit = CHANNEL_GET_MAX_LIMIT;

  const all = await readMessagesTail(CHANNEL_READ_TAIL);
  const messages = all.filter((item) => item.id > after).slice(-limit);
  const next = messages.at(-1)?.id ?? after;
  res.json({ ok: true, messages, next, limit });
}

