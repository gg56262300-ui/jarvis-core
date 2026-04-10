import { Router, type Express, type Request, type Response } from 'express';
import { WhatsappService } from './whatsapp.service.js';

const whatsappService = new WhatsappService();

export const registerWhatsappModule = (app: Express) => {
  const router = Router();

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
          code: 'WHATSAPP_PHONE_REQUIRED',
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
