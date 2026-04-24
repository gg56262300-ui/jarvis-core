import { Router, type Express } from 'express';

import { env } from '../config/index.js';
import { JobsService } from './jobs.service.js';

const jobsService = new JobsService();

export const registerJobsModule = (app: Express) => {
  if (env.REDIS_URL?.trim()) {
    // Käivita worker ainult siis, kui Redis on seadistatud.
    void import('./test.worker.js');
  }

  const router = Router();

  router.get('/status', (_request, response) => {
    response.json({
      status: 'ready',
      jobs: jobsService.list(),
    });
  });

  router.post('/test', async (_request, response) => {
    const result = await jobsService.enqueueTestJob();

    response.json({
      status: 'ready',
      job: result,
    });
  });

  router.post('/reminder', async (request, response) => {
    const reminderId = Number(request.body?.reminderId);
    const title = String(request.body?.title ?? '').trim();
    const dueAt = String(request.body?.dueAt ?? '').trim();

    if (!Number.isFinite(reminderId) || !title || !dueAt) {
      response.status(400).json({
        error: {
          code: 'REMINDER_JOB_INPUT_INVALID',
          message: 'reminderId, title ja dueAt on kohustuslikud.',
          details: null,
        },
      });
      return;
    }

    const result = await jobsService.enqueueReminderJob(reminderId, title, dueAt);

    response.json({
      status: 'ready',
      job: result,
    });
  });

  router.get('/test/:id', async (request, response) => {
    const result = await jobsService.getJob(request.params.id);

    if (!result) {
      response.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Job not found.',
          details: null,
        },
      });
      return;
    }

    response.json({
      status: 'ready',
      job: result,
    });
  });

  app.use('/api/jobs', router);
};
