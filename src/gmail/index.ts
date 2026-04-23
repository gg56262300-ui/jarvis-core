import { Router, type Express, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';

import { GmailService } from './gmail.service.js';

export const registerGmailModule = (app: Express) => {
  const router = Router();
  const gmailService = new GmailService();

  const authRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      error: 'AUTH_RATE_LIMITED',
    },
  });

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

  router.get('/google/start', async (_request: Request, response: Response, next: NextFunction) => {
    try {
      const result = await gmailService.getAuthorizationUrl();
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

  router.get('/google/callback', async (request: Request, response: Response, next: NextFunction) => {
    try {
      const code = typeof request.query.code === 'string' ? request.query.code.trim() : '';
      if (!code) {
        response.status(400).type('text').send('Missing Google OAuth code (?code=...)');
        return;
      }

      await gmailService.completeAuthorization(code);
      response
        .status(200)
        .type('text')
        .send('OK. Gmail autoriseeritud. Võid selle akna sulgeda ja minna Jarvise juurde tagasi.');
    } catch (error) {
      next(error);
    }
  });

  router.post('/google/authorize', authRateLimit, async (request: Request, response: Response, next: NextFunction) => {
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

  router.get('/message/:id', async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await gmailService.getMessageById(String(request.params.id ?? '')));
    } catch (error) {
      next(error);
    }
  });

  router.post('/send-test', authRateLimit, async (request: Request, response: Response, next: NextFunction) => {
    try {
      const to = typeof request.body?.to === 'string' ? request.body.to : '';
      const subject = typeof request.body?.subject === 'string' ? request.body.subject : '';
      const text = typeof request.body?.text === 'string' ? request.body.text : '';

      response.json(await gmailService.sendTestMessage(to, subject, text));
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/gmail', router);
};
