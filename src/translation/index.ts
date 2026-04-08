import type { Express } from 'express';

import { createModuleRouter } from '../shared/http/create-module-router.js';

export const registerTranslationModule = (app: Express) => {
  app.use('/api/translation', createModuleRouter('translation'));
};

