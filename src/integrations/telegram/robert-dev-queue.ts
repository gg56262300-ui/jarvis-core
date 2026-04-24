import fs from 'node:fs/promises';
import path from 'node:path';

import { logger } from '../../shared/logger/logger.js';

const DEV_QUEUE_PATH = path.resolve(process.cwd(), 'logs', 'dev-queue.jsonl');

export type RobertDevQueueEntry = {
  type: 'dev_task';
  source: 'telegram';
  input: string;
  goal: string;
  timestamp: string;
};

/**
 * Kui sõnum algab sõnaga "Robert" (tõstutundlikkuseta), logitakse arendusülesanne — LLM-i ei kutsuta.
 */
export async function handleRobertDevCommand(message: string): Promise<{ handled: boolean; ack: string }> {
  const raw = message.trim();
  if (!raw) {
    return { handled: false, ack: '' };
  }

  if (!/^Robert\b/i.test(raw)) {
    return { handled: false, ack: '' };
  }

  const goal = raw.replace(/^Robert\b[:,]?\s*/i, '').trim() || '(empty goal)';

  const entry: RobertDevQueueEntry = {
    type: 'dev_task',
    source: 'telegram',
    input: raw,
    goal,
    timestamp: new Date().toISOString(),
  };

  const line = `${JSON.stringify(entry)}\n`;
  try {
    await fs.mkdir(path.dirname(DEV_QUEUE_PATH), { recursive: true });
    await fs.appendFile(DEV_QUEUE_PATH, line, { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    logger.error({ err }, 'robert-dev-queue: append failed');
    return {
      handled: true,
      ack: 'DEV: ei saanud salvestada (logi viga). Proovi uuesti.',
    };
  }

  console.log('[ROBERT DEV TASK CREATED]', goal);
  logger.info({ goal, path: DEV_QUEUE_PATH }, '[ROBERT DEV TASK CREATED]');

  return {
    handled: true,
    ack: [
      'DEV: ülesanne on järjekorda kirjutatud (`logs/dev-queue.jsonl`).',
      `Eesmärk: ${goal.slice(0, 500)}${goal.length > 500 ? '…' : ''}`,
      'Cursor võib hiljem selle faili põhjal töödelda.',
    ].join('\n'),
  };
}
