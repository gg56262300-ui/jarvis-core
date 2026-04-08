import { Router, type Express } from 'express';

import { ContactsService } from './contacts.service.js';

const contactsService = new ContactsService();

export const registerContactsModule = (app: Express) => {
  const router = Router();

  router.get('/google/auth-url', async (_req, res, next) => {
    try {
      const result = await contactsService.getAuthorizationUrl();
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/google/authorize', async (req, res, next) => {
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

  app.use('/api/contacts', router);
};
