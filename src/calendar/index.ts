import { Router, type Express, type NextFunction, type Request, type Response } from 'express';

import { CalendarController } from './calendar.controller.js';
import {
  ackCalendarAlarmDismiss,
  ackCalendarAlarmSnooze,
  listDueCalendarAlarms,
} from './calendarAlarm.service.js';
import { CalendarService } from './calendar.service.js';

export const registerCalendarModule = (app: Express) => {
  const router = Router();
  const calendarService = new CalendarService();
  const calendarController = new CalendarController(calendarService);
  const handleAsync =
    (handler: (request: Request, response: Response) => Promise<void>) =>
    (request: Request, response: Response, next: NextFunction) => {
      handler(request, response).catch(next);
    };

  router.get('/', (_request, response) => {
    response.json({
      module: 'calendar',
      status: 'ready',
    });
  });

  router.get('/google/auth-url', handleAsync((request, response) =>
    calendarController.getAuthorizationUrl(request, response),
  ));

  router.get('/google/start', async (_request: Request, response: Response, next: NextFunction) => {
    try {
      const result = await calendarService.getAuthorizationUrl();
      const authUrl =
        typeof (result as { authUrl?: unknown })?.authUrl === 'string'
          ? String((result as { authUrl?: unknown }).authUrl)
          : '';
      if (!authUrl) {
        response.status(500).json(result);
        return;
      }
      response.redirect(authUrl);
    } catch (error) {
      next(error);
    }
  });

  router.get('/google/callback', handleAsync((request, response) =>
    calendarController.authorizeCallback(request, response),
  ));

  router.post('/google/authorize', handleAsync((request, response) =>
    calendarController.authorize(request, response),
  ));

  router.post('/events', handleAsync((request, response) =>
    calendarController.createEvent(request, response),
  ));

  router.get('/upcoming', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await calendarService.listUpcomingEvents(30);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/today', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 20;
      const result = await calendarService.listTodayEvents(limit);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/next', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await calendarService.listUpcomingEvents(1);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/alarms/due', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const alarms = await listDueCalendarAlarms();
      res.json({ alarms });
    } catch (error) {
      next(error);
    }
  });

  router.post('/alarms/ack', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fireKey = typeof req.body?.fireKey === 'string' ? req.body.fireKey.trim() : '';
      const action = req.body?.action === 'snooze' ? 'snooze' : 'dismiss';
      const rawSnooze = Number(req.body?.snoozeMinutes);
      const snoozeMinutes = Number.isFinite(rawSnooze) && rawSnooze > 0 ? Math.min(rawSnooze, 24 * 60) : 10;

      if (!fireKey) {
        res.status(400).json({ error: 'fireKey on kohustuslik' });
        return;
      }

      if (action === 'dismiss') {
        ackCalendarAlarmDismiss(fireKey);
      } else {
        ackCalendarAlarmSnooze(fireKey, snoozeMinutes);
      }

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/calendar', router);
};
