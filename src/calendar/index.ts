import { Router, type Express, type NextFunction, type Request, type Response } from 'express';

import { CalendarController } from './calendar.controller.js';
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

  app.use('/api/calendar', router);
};
