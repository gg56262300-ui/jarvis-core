import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { logger } from '../../shared/logger/logger.js';

const FAIL_LOG = path.resolve(process.cwd(), 'data', 'make-webhook-failed.jsonl');

export type FailedMakeRecord = {
  at: string;
  payload: Record<string, unknown>;
  upstreamStatus: number;
  error: string;
};

export function appendFailedMakeRecord(record: FailedMakeRecord): void {
  try {
    const dir = path.dirname(FAIL_LOG);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    appendFileSync(FAIL_LOG, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (error) {
    logger.warn({ err: error, operation: 'make.webhook.failed.append' }, 'Could not append failed Make log');
  }
}

export function readRecentFailedMakeRecords(limit = 100): FailedMakeRecord[] {
  if (!existsSync(FAIL_LOG)) {
    return [];
  }
  const raw = readFileSync(FAIL_LOG, 'utf8').trim();
  if (!raw) {
    return [];
  }
  const lines = raw.split('\n').filter(Boolean);
  const slice = lines.length > limit ? lines.slice(-limit) : lines;
  const out: FailedMakeRecord[] = [];
  for (const line of slice) {
    try {
      out.push(JSON.parse(line) as FailedMakeRecord);
    } catch {
      // skip corrupt line
    }
  }
  return out;
}
