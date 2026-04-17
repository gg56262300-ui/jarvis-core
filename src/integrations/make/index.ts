import { Router, type Express, type Response } from 'express';
import { z } from 'zod';

import { env } from '../../config/index.js';
import { readRecentFailedMakeRecords } from './make-webhook-failed.store.js';
import { sendJarvisMakePayload } from './make-webhook.client.js';

const notifyBodySchema = z.object({
  event: z.string().trim().min(1).max(200),
  text: z.string().trim().max(4000).optional(),
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
  res.json({
    ok: true,
    makeDelivered: false,
    upstreamStatus: result.status,
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

  router.get('/failed', (_req, res) => {
    if (env.NODE_ENV === 'production' && !env.MAKE_WEBHOOK_FAILED_INSPECT_ENABLED) {
      res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      return;
    }

    const items = readRecentFailedMakeRecords(100);
    res.json({ ok: true, count: items.length, items });
  });

  app.use('/api/integrations/make', router);
};
