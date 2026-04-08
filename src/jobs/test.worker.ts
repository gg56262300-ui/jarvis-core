import { Worker } from 'bullmq';
import { CrmService } from '../crm/crm.service.js';
import { logger } from '../shared/logger/logger.js';
import { getRedisConnection } from './queue.provider.js';

const connection = getRedisConnection();
const crmService = new CrmService();

if (!connection) {
  throw new Error('REDIS_URL puudub. Worker ei saa käivituda.');
}

export const testWorker = new Worker(
  'jarvis-default',
  async (job) => {
    if (job.name === 'test-job') {
      return {
        ok: true,
        receivedAt: new Date().toISOString(),
        payload: job.data,
      };
    }

    if (job.name === 'reminder-job') {
      const processedAt = new Date().toISOString();

      logger.info(
        {
          jobId: String(job.id),
          type: 'reminder',
          reminder: job.data,
          processedAt,
        },
        'Reminder job processed',
      );

      crmService.addReminderEvent({
        reminderId: Number(job.data.reminderId),
        eventType: 'processed',
        payload: JSON.stringify({
          jobId: String(job.id),
          processedAt,
          reminder: job.data,
        }),
      });

      return {
        ok: true,
        type: 'reminder',
        processedAt,
        reminder: job.data,
      };
    }

    return { ok: false, unknownJob: job.name };
  },
  {
    connection,
    prefix: 'jarvis',
  },
);
