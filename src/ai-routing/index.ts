import type { Express } from 'express';

import { createModuleRouter } from '../shared/http/create-module-router.js';

export const registerAiRoutingModule = (app: Express) => {
  app.use('/api/ai-routing', createModuleRouter('ai-routing'));
};

