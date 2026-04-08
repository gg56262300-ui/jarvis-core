import { Router, type Express } from 'express';
import { CrmService } from './crm.service.js';

const crmService = new CrmService();

export const registerCrmModule = (app: Express) => {
  const router = Router();

  router.get('/leads', (_req, res) => {
    res.json({
      status: 'ready',
      leads: crmService.listLeads(),
    });
  });

  router.get('/leads/:id/messages', (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      res.status(400).json({
        error: {
          code: 'CRM_LEAD_ID_INVALID',
          message: 'Lead id must be numeric.',
          details: null,
        },
      });
      return;
    }

    res.json({
      status: 'ready',
      messages: crmService.listLeadMessages(id),
    });
  });

  router.get('/reminders/:id/events', (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      res.status(400).json({
        error: {
          code: 'REMINDER_ID_INVALID',
          message: 'Reminder id must be numeric.',
          details: null,
        },
      });
      return;
    }

    res.json({
      status: 'ready',
      events: crmService.listReminderEvents(id),
    });
  });

  router.post('/leads', (req, res) => {
    const phone = String(req.body?.phone ?? '').trim();
    const name = req.body?.name ? String(req.body.name).trim() : null;
    const tag = req.body?.tag ? String(req.body.tag).trim() : null;
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;

    if (!phone) {
      res.status(400).json({
        error: {
          code: 'CRM_PHONE_REQUIRED',
          message: 'Lead phone is required.',
          details: null,
        },
      });
      return;
    }

    const lead = crmService.createLead({
      source: 'whatsapp',
      phone,
      name,
      tag,
      notes,
    });

    res.json({
      status: 'ready',
      responseText: `Lead salvestatud: ${lead.phone}.`,
      lead,
    });
  });

  app.use('/api/crm', router);
};
