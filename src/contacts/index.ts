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
