import { Router, type Express, type NextFunction, type Request, type Response } from 'express';

import { GmailService } from './gmail.service.js';

export const registerGmailModule = (app: Express) => {
  const router = Router();
  const gmailService = new GmailService();

  router.get('/', (_request, response) => {
    response.json({
      module: 'gmail',
      status: 'ready',
    });
  });

  router.get('/google/auth-url', async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await gmailService.getAuthorizationUrl());
    } catch (error) {
      next(error);
    }
  });

  router.post('/google/authorize', async (request: Request, response: Response, next: NextFunction) => {
    try {
      const code = typeof request.body?.code === 'string' ? request.body.code.trim() : '';

      if (!code) {
        response.status(400).json({
          message: 'Palun saada request body sees code väli.',
        });
        return;
      }

      response.json(await gmailService.completeAuthorization(code));
    } catch (error) {
      next(error);
    }
  });

  router.get('/inbox', async (request: Request, response: Response, next: NextFunction) => {
    try {
      const rawLimit = typeof request.query.limit === 'string' ? Number(request.query.limit) : 10;
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 20) : 10;

      response.json(await gmailService.listLatestMessages(limit));
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/gmail', router);
};
