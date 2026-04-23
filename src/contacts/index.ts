import { Router, type Express } from 'express';
import rateLimit from 'express-rate-limit';

import { ContactsService } from './contacts.service.js';

const contactsService = new ContactsService();

export const registerContactsModule = (app: Express) => {
  const router = Router();

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

  router.get('/google/auth-url', async (_req, res, next) => {
    try {
      const result = await contactsService.getAuthorizationUrl();
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/google/start', async (_req, res, next) => {
    try {
      const result = await contactsService.getAuthorizationUrl();
      const authUrl =
        typeof (result as { authUrl?: unknown })?.authUrl === 'string'
          ? String((result as { authUrl?: unknown }).authUrl)
          : '';
      if (!authUrl) {
        res.status(500).json(result);
        return;
      }
      res.redirect(authUrl);
    } catch (error) {
      next(error);
    }
  });

  router.get('/google/callback', async (req, res, next) => {
    try {
      const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
      if (!code) {
        res.status(400).type('text').send('Missing Google OAuth code (?code=...)');
        return;
      }

      await contactsService.completeAuthorization(code);
      res
        .status(200)
        .type('text')
        .send('OK. Google Contacts autoriseeritud. Võid selle akna sulgeda ja minna Jarvise juurde tagasi.');
    } catch (error) {
      next(error);
    }
  });

  router.post('/google/authorize', authRateLimit, async (req, res, next) => {
    try {
      const code = String(req.body?.code ?? '').trim();
      const result = await contactsService.completeAuthorization(code);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/list', async (_req, res, next) => {
    try {
      const result = await contactsService.listContacts(20);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/create', async (req, res, next) => {
    try {
      const name = req.body?.name ? String(req.body.name).trim() : null;
      const phone = req.body?.phone ? String(req.body.phone).trim() : null;
      const email = req.body?.email ? String(req.body.email).trim() : null;

      const result = await contactsService.createContact({
        name,
        phone,
        email,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/contacts', router);
};
