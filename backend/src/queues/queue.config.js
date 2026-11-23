// backend/src/queues/queue.config.js
// BullMQ configuration, connection factory, and default job options.

import { getRedisConnectionOptions } from '../config/redis.js';
import { env } from '../config/environment.js';

export const SYNC_QUEUE_NAME = 'missive-seo-sync';

/**
 * Standard default job options for sync tasks.
 * Includes exponential backoff, retry caps, and historical retention limits.
 */
export const defaultJobOptions = {
  attempts: env.MAX_SYNC_RETRIES || 3,
  backoff: {
    type: 'exponential',
    delay: env.SYNC_RETRY_DELAY_MS || 5000,
  },
  removeOnComplete: {
    age: 86400 * 7, // Keep completed jobs for 7 days
    count: 1000,
  },
  removeOnFail: {
    age: 86400 * 14, // Keep failed jobs for 14 days for debugging
    count: 2000,
  },
};

/**
 * Returns connection options formatted specifically for BullMQ.
 */
export function getBullMQConnection() {
  return getRedisConnectionOptions();
}

export default {
  SYNC_QUEUE_NAME,
  defaultJobOptions,
  getBullMQConnection,
};
