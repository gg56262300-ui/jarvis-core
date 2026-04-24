import { Router, type Express, type Request, type Response } from 'express';

import { env } from '../config/env.js';
import { logger } from '../shared/logger/logger.js';
import { processMetaWebhookPayload, verifyMetaWebhookSignature } from './meta-cloud.js';
import { WhatsappService } from './whatsapp.service.js';

const whatsappService = new WhatsappService();

export const registerWhatsappModule = (app: Express) => {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    const verifyToken = Boolean(env.WHATSAPP_CLOUD_VERIFY_TOKEN?.trim());
    const appSecret = Boolean(env.WHATSAPP_CLOUD_APP_SECRET?.trim());
    const accessToken = Boolean(env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim());
    const phoneNumberId = Boolean(env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim());

    const missing: string[] = [];
    if (!verifyToken) missing.push('WHATSAPP_CLOUD_VERIFY_TOKEN');
    if (!accessToken) missing.push('WHATSAPP_CLOUD_ACCESS_TOKEN');
    if (!phoneNumberId) missing.push('WHATSAPP_CLOUD_PHONE_NUMBER_ID');
    if (env.NODE_ENV === 'production' && !appSecret) missing.push('WHATSAPP_CLOUD_APP_SECRET');

    res.json({
      status: missing.length === 0 ? 'ready' : 'degraded',
      ok: missing.length === 0,
      missing,
      signatureVerification: env.NODE_ENV === 'production' ? (appSecret ? 'enabled' : 'required') : appSecret ? 'enabled' : 'dev_only_off',
    });
  });

  router.get('/webhook', (req: Request, res: Response) => {
    const verifyToken = env.WHATSAPP_CLOUD_VERIFY_TOKEN?.trim();
    if (!verifyToken) {
      res.status(503).send('WhatsApp Cloud verify token not configured');
      return;
    }
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === verifyToken && typeof challenge === 'string') {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
  });

  router.post(
    '/webhook',
    async (req: Request, res: Response) => {
      if (!env.WHATSAPP_CLOUD_VERIFY_TOKEN?.trim()) {
        res.status(503).json({ error: 'webhook_not_configured' });
        return;
      }

      const captured = (req as unknown as { rawBody?: Buffer }).rawBody;
      let rawBody: Buffer;
      if (captured) {
        rawBody = captured;
      } else if (Buffer.isBuffer(req.body)) {
        rawBody = req.body;
      } else if (typeof req.body === 'string') {
        rawBody = Buffer.from(req.body, 'utf8');
      } else {
        rawBody = Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
      }

      const secret = env.WHATSAPP_CLOUD_APP_SECRET?.trim();
      if (secret) {
        const sig = req.get('x-hub-signature-256');
        if (!verifyMetaWebhookSignature(rawBody, sig, secret)) {
          res.sendStatus(403);
          return;
        }
      } else if (env.NODE_ENV === 'production') {
        logger.warn('WHATSAPP_CLOUD_APP_SECRET missing in production — rejecting webhook POST');
        res.status(503).json({ error: 'signature_not_configured' });
        return;
      } else {
        logger.warn('WHATSAPP_CLOUD_APP_SECRET missing — webhook signature not verified (dev only)');
      }

      try {
        await processMetaWebhookPayload(rawBody, whatsappService);
        res.sendStatus(200);
      } catch (err) {
        logger.error({ err }, 'whatsapp webhook processing failed');
        res.sendStatus(500);
      }
    },
  );

  const handleInboundRoute = async (req: Request, res: Response) => {
    const phone = String(req.body?.phone ?? '').trim();
    const name = req.body?.name ? String(req.body.name).trim() : null;
    const message = req.body?.message ? String(req.body.message).trim() : null;
    const projectCode = req.body?.projectCode ? String(req.body.projectCode).trim() : null;
    const city = req.body?.city ? String(req.body.city).trim() : null;
    const serviceType = req.body?.serviceType ? String(req.body.serviceType).trim() : null;

    const result = await whatsappService.handleInboundMessage({
      phone,
      name,
      message,
      projectCode,
      city,
      serviceType,
      channel: 'whatsapp',
    });

    if (result.status === 'error') {
      res.status(400).json({
        error: {
          code: 'WHATSAPP_INBOUND_INVALID',
          message: result.responseText,
          details: null,
        },
      });
      return;
    }

    res.json(result);
  };

  router.post('/', handleInboundRoute);
  router.post('/inbound', handleInboundRoute);

  app.use('/api/whatsapp', router);
};
