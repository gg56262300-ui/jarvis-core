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
import { registerJobsModule } from './jobs/index.js';
import { registerRemindersModule } from './reminders/index.js';
import { registerTranslationModule } from './translation/index.js';
import { registerTimeModule } from './time/index.js';
import { registerVoiceModule } from './voice/index.js';
import { registerWhatsappModule } from './whatsapp/index.js';
import { registerWeatherModule } from './weather/index.js';
import { registerDebugRoutes } from './debug/index.js';
import { httpLogger } from './shared/logger/http-logger.js';
import { databaseProvider } from './shared/database/index.js';
import { errorHandler } from './shared/errors/error-handler.js';
import { notFoundHandler } from './shared/errors/not-found-handler.js';
import { createHealthRouter } from './shared/http/health.router.js';

export const buildApp = () => {
  databaseProvider.initialize();

  const app = express();
  const publicDirectory = path.resolve(process.cwd(), 'public');

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(httpLogger);
  app.use(express.static(publicDirectory));

  app.use('/health', createHealthRouter());

  registerBridgeModule(app);
  registerContactsModule(app);
  registerGmailModule(app);
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
  registerDebugRoutes(app);

  app.get('/', (_request, response) => {
    response.sendFile(path.join(publicDirectory, 'index.html'));
  });

  Sentry.setupExpressErrorHandler(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
