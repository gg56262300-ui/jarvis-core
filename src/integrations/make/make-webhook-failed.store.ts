import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { logger } from '../../shared/logger/logger.js';

const FAIL_LOG = path.resolve(process.cwd(), 'data', 'make-webhook-failed.jsonl');

export type FailedMakeRecord = {
  at: string;
  payload: Record<string, unknown>;
  upstreamStatus: number;
  error: string;
  retryable?: boolean;
  failureKind?:
    | 'network_or_timeout'
    | 'queue_full'
    | 'rate_limited'
    | 'upstream_5xx'
    | 'not_found_or_gone'
    | 'bad_request'
    | 'unknown';
  recommendation?: string;
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

export type ClearFailedMakeRecordsResult = {
  ok: true;
  removed: number;
  kept: number;
};

export function clearFailedMakeRecords(filter?: {
  /** Kui antud, eemaldab ainult selle kindi read; muidu eemaldab kõik. */
  kind?: FailedMakeRecord['failureKind'];
  /** Kui antud, eemaldab ainult need read, mille retryable vastab; muidu ignoreerib. */
  retryable?: boolean;
}): ClearFailedMakeRecordsResult {
  if (!existsSync(FAIL_LOG)) {
    return { ok: true, removed: 0, kept: 0 };
  }

  const raw = readFileSync(FAIL_LOG, 'utf8');
  if (!raw.trim()) {
    return { ok: true, removed: 0, kept: 0 };
  }

  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  let removed = 0;
  const keptLines: string[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as FailedMakeRecord;
      const kindOk = filter?.kind ? (parsed.failureKind || 'unknown') === filter.kind : true;
      const retryOk =
        typeof filter?.retryable === 'boolean' ? Boolean(parsed.retryable) === filter.retryable : true;
      const remove = kindOk && retryOk;
      if (remove) {
        removed += 1;
      } else {
        keptLines.push(line);
      }
    } catch {
      // Kui rida on katkine, jätame alles (turvaline).
      keptLines.push(line);
    }
  }

  try {
    writeFileSync(FAIL_LOG, keptLines.length ? `${keptLines.join('\n')}\n` : '', 'utf8');
  } catch (error) {
    logger.warn({ err: error, operation: 'make.webhook.failed.clear' }, 'Could not clear failed Make log');
  }

  return { ok: true, removed, kept: keptLines.length };
}
