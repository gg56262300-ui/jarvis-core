import { Router, type Express } from 'express';

import { pushService } from './push.service.js';

const router = Router();

router.get('/public-key', async (_req, res) => {
  const key = await pushService.getVapidPublicKey();
  if (!key) {
    res.status(503).json({ ok: false, error: 'PUSH_NOT_READY' });
    return;
  }
  res.json({ ok: true, publicKey: key });
});

router.post('/subscribe', async (req, res) => {
  const code =
    String(req.headers['x-jarvis-pair-code'] ?? '').trim() ||
    String(req.body?.code ?? '').trim();

  if (!pushService.isPairCodeValid(code)) {
    res.status(401).json({ ok: false, error: 'PUSH_UNAUTHORIZED' });
    return;
  }

  const subscription = req.body?.subscription ?? req.body;
  const result = await pushService.upsertSubscription(subscription);
  if (!result.ok) {
    res.status(400).json({ ok: false, error: result.error });
    return;
  }
  res.json({ ok: true, count: result.count });
});

export const registerPushModule = (app: Express) => {
  app.use('/api/push', router);
};

