import { Router, type Express } from 'express';

import { CalendarService } from '../calendar/calendar.service.js';

export const registerBridgeModule = (app: Express) => {
  const router = Router();
  const calendarService = new CalendarService();

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

  router.get('/v1/calendar/today', async (req, res, next) => {
    const expectedToken = process.env.JARVIS_BRIDGE_TOKEN?.trim();
    const providedToken = String(req.headers['x-jarvis-bridge-token'] ?? '').trim();

    if (!expectedToken || !providedToken || providedToken !== expectedToken) {
      res.status(401).json({ ok: false, error: 'BRIDGE_UNAUTHORIZED' });
      return;
    }

    try {
      const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 20;
      const result = await calendarService.listTodayEvents(limit);

      res.json({
        ok: true,
        command_id: 'calendar.today',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/v1/calendar/next', async (req, res, next) => {
    const expectedToken = process.env.JARVIS_BRIDGE_TOKEN?.trim();
    const providedToken = String(req.headers['x-jarvis-bridge-token'] ?? '').trim();

    if (!expectedToken || !providedToken || providedToken !== expectedToken) {
      res.status(401).json({ ok: false, error: 'BRIDGE_UNAUTHORIZED' });
      return;
    }

    try {
      const result = await calendarService.listUpcomingEvents(1);

      res.json({
        ok: true,
        command_id: 'calendar.next',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/v1/calendar/upcoming', async (req, res, next) => {
    const expectedToken = process.env.JARVIS_BRIDGE_TOKEN?.trim();
    const providedToken = String(req.headers['x-jarvis-bridge-token'] ?? '').trim();

    if (!expectedToken || !providedToken || providedToken !== expectedToken) {
      res.status(401).json({ ok: false, error: 'BRIDGE_UNAUTHORIZED' });
      return;
    }

    try {
      const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 10;
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 10;
      const result = await calendarService.listUpcomingEvents(limit);

      res.json({
        ok: true,
        command_id: 'calendar.upcoming',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/v1/calendar/events', async (req, res, next) => {
    const expectedToken = process.env.JARVIS_BRIDGE_TOKEN?.trim();
    const providedToken = String(req.headers['x-jarvis-bridge-token'] ?? '').trim();

    if (!expectedToken || !providedToken || providedToken !== expectedToken) {
      res.status(401).json({ ok: false, error: 'BRIDGE_UNAUTHORIZED' });
      return;
    }

    const idempotencyKey = String(req.headers['idempotency-key'] ?? '').trim();
    if (!idempotencyKey) {
      res.status(400).json({ ok: false, error: 'IDEMPOTENCY_KEY_REQUIRED' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const start = typeof body?.start === 'string' ? body.start.trim() : '';
    const end = typeof body?.end === 'string' ? body.end.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : undefined;
    const location = typeof body?.location === 'string' ? body.location.trim() : undefined;

    if (!title || !start || !end) {
      res.status(400).json({ ok: false, error: 'INVALID_BODY' });
      return;
    }

    try {
      const result = await calendarService.createEvent({
        title,
        start,
        end,
        ...(description ? { description } : {}),
        ...(location ? { location } : {}),
      });

      res.json({
        ok: true,
        command_id: 'calendar.event.create',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use('/bridge', router);
};
