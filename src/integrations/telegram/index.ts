import type { Express } from 'express';

import { getTelegramIntegrationStatus } from './telegram-status.controller.js';
import { handleTelegramWebhook } from './webhook.controller.js';

export function registerTelegramIntegrationModule(app: Express): void {
  app.get('/api/integrations/telegram/status', (req, res, next) => {
    void getTelegramIntegrationStatus(req, res).catch(next);
  });
  app.post('/api/integrations/telegram/webhook', handleTelegramWebhook);
}
