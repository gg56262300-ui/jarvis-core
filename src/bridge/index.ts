import { Router, type Express } from 'express';

export const registerBridgeModule = (app: Express) => {
  const router = Router();

  router.get('/v1/health', (req, res) => {
    const expectedToken = process.env.JARVIS_BRIDGE_TOKEN?.trim();
    const providedToken = String(req.headers['x-jarvis-bridge-token'] ?? '').trim();

    if (!expectedToken || !providedToken || providedToken !== expectedToken) {
      res.status(401).json({ ok: false, error: 'BRIDGE_UNAUTHORIZED' });
      return;
    }

    res.json({
      ok: true,
      command_id: 'health',
      data: {
        status: 'ok',
        service: 'jarvis-core',
      },
    });
  });

  app.use('/bridge', router);
};
