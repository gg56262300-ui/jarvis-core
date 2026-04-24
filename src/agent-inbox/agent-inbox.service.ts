import fs from 'node:fs/promises';
import path from 'node:path';

import { env } from '../config/index.js';
import { logger } from '../shared/logger/logger.js';

const MAX_TEXT_CHARS = 8000;

export type AgentInboxSource = 'chat' | 'api' | 'telegram' | 'whatsapp';

export type AgentInboxEntry = {
  t: string;
  source: AgentInboxSource;
  text: string;
};

export function isAgentInboxEnabled(): boolean {
  return Boolean(env.JARVIS_AGENT_INBOX_TOKEN?.trim());
}

export function verifyAgentInboxToken(headerToken: string | undefined): boolean {
  const expected = env.JARVIS_AGENT_INBOX_TOKEN?.trim();
  if (!expected) {
    return false;
  }
  const got = headerToken?.trim();
  return Boolean(got && got === expected);
}

function inboxFilePath() {
  return path.resolve(process.cwd(), 'logs', 'agent-inbox.jsonl');
}

export async function appendAgentInboxEntry(
  entry: Omit<AgentInboxEntry, 't'> & { t?: string },
): Promise<void> {
  const text = entry.text.slice(0, MAX_TEXT_CHARS);
  const line: AgentInboxEntry = {
    t: entry.t ?? new Date().toISOString(),
    source: entry.source,
    text,
  };

  try {
    const filePath = inboxFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(line)}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    logger.warn({ err }, 'agent-inbox: append failed');
  }
}

export async function readAgentInboxTail(limitLines: number): Promise<AgentInboxEntry[]> {
  const filePath = inboxFilePath();
  const capped = Math.min(Math.max(1, limitLines), 500);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim() !== '');
    const slice = lines.slice(-capped);
    const out: AgentInboxEntry[] = [];
    for (const line of slice) {
      try {
        out.push(JSON.parse(line) as AgentInboxEntry);
      } catch {
        // skip corrupt line
      }
    }
    return out;
  } catch {
    return [];
  }
}
