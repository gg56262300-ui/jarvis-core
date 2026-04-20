import { Router, type Express } from 'express';
import { CrmService } from './crm.service.js';

const crmService = new CrmService();

export const registerCrmModule = (app: Express) => {
  const router = Router();

  const normalizePhone = (value: unknown): string => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return raw.replace(/[^\d+]/g, '');
  };

  const normalizeOptional = (value: unknown, maxLen = 200): string | null => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const compact = raw.replace(/\s+/g, ' ');
    return compact.length > maxLen ? compact.slice(0, maxLen) : compact;
  };

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
    const phone = normalizePhone(req.body?.phone);
    const name = normalizeOptional(req.body?.name, 120);
    const tag = normalizeOptional(req.body?.tag, 80);
    const notes = normalizeOptional(req.body?.notes, 800);
    const projectCode = normalizeOptional(req.body?.projectCode, 40);
    const city = normalizeOptional(req.body?.city, 120);
    const serviceType = normalizeOptional(req.body?.serviceType, 120);
    const sourceRaw = req.body?.source ? String(req.body.source).trim().toLowerCase() : 'manual';
    const source =
      sourceRaw === 'whatsapp' || sourceRaw === 'web' || sourceRaw === 'manual' ? sourceRaw : 'manual';

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

    if (phone.length < 7) {
      res.status(400).json({
        error: {
          code: 'CRM_PHONE_INVALID',
          message: 'Lead phone is invalid.',
          details: { phone },
        },
      });
      return;
    }

    const lead = crmService.createLead({
      source,
      phone,
      name,
      tag,
      notes,
      projectCode,
      city,
      serviceType,
    });

    res.json({
      status: 'ready',
      responseText: `Lead salvestatud: ${lead.phone}.`,
      lead,
    });
  });

  app.use('/api/crm', router);
};
