import { Router, type Express } from 'express';
import { TimeService } from './time.service.js';

const timeService = new TimeService();

export const registerTimeModule = (app: Express) => {
  const router = Router();

  router.get('/now', (_req, res) => {
    res.json({
      status: 'ready',
      ...timeService.getNow(),
    });
  });

  app.use('/api/time', router);
};
