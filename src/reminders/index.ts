import { Router, type Express } from 'express';

import { databaseProvider } from '../shared/database/index.js';
import { validateRequestBody, validateRequestParams } from '../shared/http/validate.js';
import { createReminderSchema, reminderIdParamsSchema } from './reminders.schemas.js';
import { RemindersRepository } from './reminders.repository.js';
import { RemindersService } from './reminders.service.js';
import { JobsService } from '../jobs/jobs.service.js';

const buildRemindersRouter = () => {
  const router = Router();
  const remindersRepository = new RemindersRepository(databaseProvider);
  const remindersService = new RemindersService(remindersRepository);
  const jobsService = new JobsService();

  remindersRepository.initialize();

  router.get('/', (_request, response) => {
    response.json({
      items: remindersService.list(),
    });
  });

  router.post('/', async (request, response) => {
    const input = validateRequestBody(createReminderSchema, request, 'Invalid reminder payload');
    const reminder = remindersService.create(input);

    let queuedJob = null;

    if (reminder.dueAt) {
      queuedJob = await jobsService.enqueueReminderJob(reminder.id, reminder.title, reminder.dueAt);
    }

    response.status(201).json({
      item: reminder,
      queuedJob,
    });
  });

  router.patch('/:id/done', (request, response) => {
    const params = validateRequestParams(reminderIdParamsSchema, request, 'Invalid reminder id');
    const reminder = remindersService.markDone(params.id);

    response.json({
      item: reminder,
    });
  });

  return router;
};

export const registerRemindersModule = (app: Express) => {
  app.use('/api/reminders', buildRemindersRouter());
};
