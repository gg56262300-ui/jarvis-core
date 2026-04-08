import { Router } from 'express';

export const createHealthRouter = () => {
  const router = Router();

  router.get('/', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'jarvis-core',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
};

