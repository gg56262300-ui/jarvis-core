import express from 'express';
import * as Sentry from '@sentry/node';
import path from 'node:path';

import { registerAiRoutingModule } from './ai-routing/index.js';
import { registerBridgeModule } from './bridge/index.js';
import { registerCalendarModule } from './calendar/index.js';
import { registerCalculatorModule } from './calculator/index.js';
import { registerContactsModule } from './contacts/index.js';
import { registerCrmModule } from './crm/index.js';
import { registerGmailModule } from './gmail/index.js';
import { registerMakeIntegrationModule } from './integrations/make/index.js';
import { registerTelegramIntegrationModule } from './integrations/telegram/index.js';
import { registerJobsModule } from './jobs/index.js';
import { registerRemindersModule } from './reminders/index.js';
import { registerTranslationModule } from './translation/index.js';
import { registerTimeModule } from './time/index.js';
import { registerVoiceModule } from './voice/index.js';
import { registerWhatsappModule } from './whatsapp/index.js';
import { registerWeatherModule } from './weather/index.js';
import { registerAgentInboxModule } from './agent-inbox/index.js';
import { registerChatModule } from './chat/index.js';
import { registerDebugRoutes } from './debug/index.js';
import { registerPushModule } from './push/index.js';
import { httpLogger } from './shared/logger/http-logger.js';
import { databaseProvider } from './shared/database/index.js';
import { errorHandler } from './shared/errors/error-handler.js';
import { notFoundHandler } from './shared/errors/not-found-handler.js';
import { createHealthRouter } from './shared/http/health.router.js';
import { registerGoogleOAuthLanding } from './shared/http/google-oauth-landing.js';
import { env } from './config/index.js';
import { logger } from './shared/logger/logger.js';

export const buildApp = () => {
  databaseProvider.initialize();

  logger.info(
    {
      openaiKey: Boolean(env.OPENAI_API_KEY),
      openaiOrg: Boolean(env.OPENAI_ORG_ID),
      openaiProject: Boolean(env.OPENAI_PROJECT_ID),
      openaiCustomBaseUrl: Boolean(env.OPENAI_BASE_URL),
    },
    'OpenAI seadistuse ülevaade (saladusi ei logita)',
  );

  const app = express();
  const publicDirectory = path.resolve(process.cwd(), 'public');

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // Vaikimisi express.json() limiit on ~100kb; voice audio base64 ületab selle enne /api/voice/audio-turn rada.
  app.use(
    express.json({
      limit: '20mb',
      verify: (req, _res, buf) => {
        // WhatsApp webhook signature verification needs the exact raw bytes.
        const url = (req as unknown as { url?: string }).url;
        if (typeof url === 'string' && url.startsWith('/api/whatsapp/webhook')) {
          (req as unknown as { rawBody?: Buffer }).rawBody = buf;
        }
      },
    }),
  );
  app.use(httpLogger);
  app.use(
    express.static(publicDirectory, {
      setHeaders: (res, filePath) => {
        const name = path.basename(filePath).toLowerCase();
        const isShell = name.endsWith('.html') || name === 'sw.js';
        if (isShell) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }),
  );

  app.use('/health', createHealthRouter());
  registerGoogleOAuthLanding(app);

  registerBridgeModule(app);
  registerContactsModule(app);
  registerGmailModule(app);
  registerMakeIntegrationModule(app);
  registerTelegramIntegrationModule(app);
  registerCalendarModule(app);
  registerCalculatorModule(app);
  registerTranslationModule(app);
  registerTimeModule(app);
  registerAiRoutingModule(app);
  registerVoiceModule(app);
  registerWeatherModule(app);
  registerWhatsappModule(app);
  registerRemindersModule(app);
  registerCrmModule(app);
  registerJobsModule(app);
  registerChatModule(app);
  registerAgentInboxModule(app);
  registerPushModule(app);
  registerDebugRoutes(app);

  app.get('/', (_request, response) => {
    response.sendFile(path.join(publicDirectory, 'index.html'));
  });

  Sentry.setupExpressErrorHandler(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
