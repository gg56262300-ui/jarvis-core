import { Router, type Express, type Response } from 'express';
import { z } from 'zod';

import { env } from '../../config/index.js';
import { clearFailedMakeRecords, readRecentFailedMakeRecords } from './make-webhook-failed.store.js';
import { classifyMakeFailure, sendJarvisMakePayload } from './make-webhook.client.js';

const DEFAULT_FAILED_LOG_LIMIT = 100;
const MAX_FAILED_LOG_LIMIT = 500;
const MAKE_FAILURE_KINDS = [
  'network_or_timeout',
  'queue_full',
  'rate_limited',
  'upstream_5xx',
  'not_found_or_gone',
  'bad_request',
  'unknown',
] as const;

const notifyBodySchema = z.object({
  event: z.string().trim().min(1).max(200),
  text: z.string().trim().max(4000).optional(),
});

const failedQuerySchema = z.object({
  limit: z
    .preprocess((value) => {
      if (typeof value !== 'string' || !value.trim()) return undefined;
      const asNumber = Number(value);
      return Number.isFinite(asNumber) ? asNumber : value;
    }, z.number().int().min(1).max(MAX_FAILED_LOG_LIMIT).optional())
    .optional(),
  retryable: z
    .preprocess((value) => {
      if (typeof value !== 'string') return undefined;
      const normalized = value.trim().toLowerCase();
      if (normalized === '1' || normalized === 'true') return true;
      if (normalized === '0' || normalized === 'false') return false;
      return value;
    }, z.boolean().optional())
    .optional(),
  kind: z
    .preprocess((value) => {
      if (typeof value !== 'string') return undefined;
      const normalized = value.trim().toLowerCase();
      return normalized || undefined;
    }, z.enum(MAKE_FAILURE_KINDS).optional())
    .optional(),
});

const clearFailedQuerySchema = z.object({
  confirm: z
    .preprocess((value) => {
      if (typeof value !== 'string') return undefined;
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes' ? true : undefined;
    }, z.boolean().optional())
    .optional(),
  retryable: failedQuerySchema.shape.retryable,
  kind: failedQuerySchema.shape.kind,
});

/** Jarvis accepts the request; Make delivery status is separate so 404/410 from Make do not block callers. */
const respondMakeResult = (
  res: Response,
  result:
    | { ok: true; status: number }
    | { ok: false; status: number; error: string },
) => {
  if (result.ok) {
    res.json({ ok: true, makeDelivered: true, upstreamStatus: result.status });
    return;
  }
  const classified = classifyMakeFailure(result.status, result.error);
  res.json({
    ok: true,
    makeDelivered: false,
    upstreamStatus: result.status,
    retryable: classified.retryable,
    failureKind: classified.kind,
    recommendation: classified.recommendation,
    detail: result.error,
  });
};

export const registerMakeIntegrationModule = (app: Express) => {
  const router = Router();

  router.post('/test', async (_req, res) => {
    if (env.NODE_ENV === 'production' && !env.MAKE_WEBHOOK_TEST_ENABLED) {
      res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      return;
    }

    const url = env.MAKE_WEBHOOK_URL;
    if (!url) {
      res.status(503).json({ ok: false, error: 'MAKE_WEBHOOK_URL_NOT_CONFIGURED' });
      return;
    }

    const result = await sendJarvisMakePayload(url, {
      event: 'test',
      text: 'hello from jarvis',
    });

    respondMakeResult(res, result);
  });

  router.post('/notify', async (req, res) => {
    if (env.NODE_ENV === 'production' && !env.MAKE_WEBHOOK_NOTIFY_ENABLED) {
      res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      return;
    }

    const url = env.MAKE_WEBHOOK_URL;
    if (!url) {
      res.status(503).json({ ok: false, error: 'MAKE_WEBHOOK_URL_NOT_CONFIGURED' });
      return;
    }

    const parsed = notifyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'INVALID_BODY' });
      return;
    }

    const { event, text } = parsed.data;
    const result = await sendJarvisMakePayload(url, {
      event,
      ...(text !== undefined && text.length > 0 ? { text } : {}),
    });

    respondMakeResult(res, result);
  });

  router.get('/failed', (req, res) => {
    if (env.NODE_ENV === 'production' && !env.MAKE_WEBHOOK_FAILED_INSPECT_ENABLED) {
      res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      return;
    }

    const parsedQuery = failedQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      res.status(400).json({
        ok: false,
        error: 'INVALID_QUERY',
        detail:
          'Use ?limit=1..500 and optional filters ?retryable=true|false and ?kind=queue_full|rate_limited|...',
      });
      return;
    }

    const limit = parsedQuery.data.limit ?? DEFAULT_FAILED_LOG_LIMIT;
    const requestedRetryable = parsedQuery.data.retryable;
    const requestedKind = parsedQuery.data.kind;

    const rawItems = readRecentFailedMakeRecords(limit);
    const items = rawItems.map((item) => {
      if (item.failureKind && typeof item.retryable === 'boolean' && item.recommendation) {
        return item;
      }
      const classified = classifyMakeFailure(item.upstreamStatus, item.error || '');
      return {
        ...item,
        retryable: classified.retryable,
        failureKind: classified.kind,
        recommendation: classified.recommendation,
      };
    });

    const filteredItems =
      typeof requestedRetryable === 'boolean'
        ? items.filter((item) => Boolean(item.retryable) === requestedRetryable)
        : items;
    const kindFilteredItems = requestedKind
      ? filteredItems.filter((item) => (item.failureKind || 'unknown') === requestedKind)
      : filteredItems;

    const summary = kindFilteredItems.reduce<Record<string, number>>((acc, item) => {
      const key = item.failureKind || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const retryableCount = kindFilteredItems.filter((item) => item.retryable).length;
    res.json({
      ok: true,
      count: kindFilteredItems.length,
      sourceCount: items.length,
      retryableCount,
      summary,
      filters: { limit, retryable: requestedRetryable ?? null, kind: requestedKind ?? null },
      items: kindFilteredItems,
    });
  });

  router.post('/failed/clear', (req, res) => {
    if (env.NODE_ENV === 'production' && !env.MAKE_WEBHOOK_FAILED_INSPECT_ENABLED) {
      res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      return;
    }

    const parsedQuery = clearFailedQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success || parsedQuery.data.confirm !== true) {
      res.status(400).json({
        ok: false,
        error: 'CONFIRM_REQUIRED',
        detail: 'Use POST /api/integrations/make/failed/clear?confirm=1&kind=...&retryable=true|false',
      });
      return;
    }

    const result = clearFailedMakeRecords({
      kind: parsedQuery.data.kind,
      retryable: parsedQuery.data.retryable,
    });

    res.json({
      ok: true,
      removed: result.removed,
      kept: result.kept,
      filters: {
        kind: parsedQuery.data.kind ?? null,
        retryable: typeof parsedQuery.data.retryable === 'boolean' ? parsedQuery.data.retryable : null,
      },
    });
  });

  app.use('/api/integrations/make', router);
};
