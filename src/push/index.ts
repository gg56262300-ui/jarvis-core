import { Router, type Express } from 'express';

import { pushService } from './push.service.js';

const router = Router();

function bridgeTokenOk(req: { headers: Record<string, unknown> }): boolean {
  const expected = process.env.JARVIS_BRIDGE_TOKEN?.trim();
  if (!expected) {
    return false;
  }
  const header =
    String(req.headers['x-jarvis-bridge-token'] ?? '').trim() ||
    String(req.headers['authorization'] ?? '')
      .replace(/^Bearer\s+/i, '')
      .trim();
  return Boolean(header) && header === expected;
}

router.get('/public-key', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
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

router.get('/status', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const status = await pushService.getStatus();
  res.json(status);
});

/** Kaitstud: Web Push test (sama token mis bridge). Keha: { "text": "..." } */
router.post('/test-ping', async (req, res) => {
  if (!bridgeTokenOk(req)) {
    res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    return;
  }
  const text = String(req.body?.text ?? 'ping').trim();
  const result = await pushService.sendTestPing(text);
  res.json(result);
});

export const registerPushModule = (app: Express) => {
  app.use('/api/push', router);
};

