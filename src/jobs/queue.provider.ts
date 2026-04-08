import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { env } from '../config/index.js';

let redisConnection: Redis | null = null;
let defaultQueue: Queue | null = null;

export const getRedisConnection = () => {
  if (!env.REDIS_URL) {
    return null;
  }

  if (!redisConnection) {
    redisConnection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  return redisConnection;
};

export const getDefaultQueue = () => {
  const connection = getRedisConnection();

  if (!connection) {
    return null;
  }

  if (!defaultQueue) {
    defaultQueue = new Queue('jarvis-default', {
      connection,
      prefix: env.REDIS_QUEUE_PREFIX,
    });
  }

  return defaultQueue;
};
