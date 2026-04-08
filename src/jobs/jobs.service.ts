import { CrmService } from '../crm/crm.service.js';
import { env } from '../config/index.js';
import { getDefaultQueue, getRedisConnection } from './queue.provider.js';

export class JobsService {
  private readonly crmService = new CrmService();

  list() {
    const redisConnection = getRedisConnection();
    const defaultQueue = getDefaultQueue();

    return [
      {
        name: 'jarvis-default',
        redisConfigured: Boolean(env.REDIS_URL),
        queuePrefix: env.REDIS_QUEUE_PREFIX,
        redisConnectionInitialized: Boolean(redisConnection),
        queueInitialized: Boolean(defaultQueue),
      },
    ];
  }

  async enqueueTestJob() {
    const queue = getDefaultQueue();

    if (!queue) {
      throw new Error('Queue ei ole saadaval. REDIS_URL puudub või Redis ei tööta.');
    }

    const job = await queue.add('test-job', {
      source: 'jarvis-manual-test',
      createdAt: new Date().toISOString(),
    });

    return {
      id: String(job.id),
      name: job.name,
      queueName: job.queueName,
    };
  }

  async enqueueReminderJob(reminderId: number, title: string, dueAt: string) {
    const queue = getDefaultQueue();

    if (!queue) {
      throw new Error('Queue ei ole saadaval. REDIS_URL puudub või Redis ei tööta.');
    }

    const delay = Math.max(new Date(dueAt).getTime() - Date.now(), 0);

    const job = await queue.add(
      'reminder-job',
      {
        reminderId,
        title,
        dueAt,
      },
      {
        delay,
      },
    );

    this.crmService.addReminderEvent({
      reminderId,
      eventType: 'queued',
      payload: JSON.stringify({
        jobId: String(job.id),
        title,
        dueAt,
        delay,
      }),
    });

    return {
      id: String(job.id),
      name: job.name,
      queueName: job.queueName,
      delay,
    };
  }

  async getJob(jobId: string) {
    const queue = getDefaultQueue();

    if (!queue) {
      throw new Error('Queue ei ole saadaval. REDIS_URL puudub või Redis ei tööta.');
    }

    const job = await queue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();

    return {
      id: String(job.id),
      name: job.name,
      state,
      data: job.data,
      returnvalue: job.returnvalue ?? null,
      failedReason: job.failedReason ?? null,
    };
  }
}
