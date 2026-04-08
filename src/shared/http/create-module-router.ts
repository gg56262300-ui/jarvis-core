import { Router } from 'express';

export const createModuleRouter = (moduleName: string) => {
  const router = Router();

  router.get('/', async (_request, response) => {
    response.json({
      module: moduleName,
      status: 'ready',
    });
  });

  return router;
};

