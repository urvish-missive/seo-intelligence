// backend/src/queues/sync.queue.js
// BullMQ Sync Queue producer for dispatching background synchronisation tasks.

import { Queue } from 'bullmq';
import { SYNC_QUEUE_NAME, defaultJobOptions, getBullMQConnection } from './queue.config.js';
import { isRedisAvailable } from '../config/redis.js';
import logger from '../utils/logger.js';

let syncQueue = null;

/**
 * Initialize or retrieve the singleton BullMQ Sync Queue.
 */
export function getSyncQueue() {
  if (!syncQueue) {
    const connection = getBullMQConnection();
    syncQueue = new Queue(SYNC_QUEUE_NAME, {
      connection,
      defaultJobOptions,
    });

    syncQueue.on('error', (err) => {
      logger.warn(`BullMQ Queue Error: ${err.message}`);
    });
  }
  return syncQueue;
}

/**
 * Push a synchronisation task into the queue.
 *
 * @param {object} payload - Job payload containing websiteId, provider, dateRange, etc.
 * @param {object} customOptions - Overrides for BullMQ job options
 */
export async function addSyncJob(payload, customOptions = {}) {
  const queue = getSyncQueue();
  const jobName = `sync:${payload.provider}:${payload.websiteId}`;
  
  // Use deterministic jobId to prevent identical pending duplicates
  const jobId = customOptions.jobId || `${payload.websiteId}-${payload.provider}-${payload.jobType || 'INCREMENTAL'}-${Date.now()}`;

  const job = await queue.add(jobName, payload, {
    ...defaultJobOptions,
    jobId,
    ...customOptions,
  });

  logger.info(`Queued BullMQ job ${job.id} for ${payload.provider} (websiteId: ${payload.websiteId})`);
  return job;
}

/**
 * Retrieve status and state of a BullMQ job.
 */
export async function getJobStatus(jobId) {
  const queue = getSyncQueue();
  const job = await queue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  return {
    id: job.id,
    name: job.name,
    state,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
    timestamp: job.timestamp,
    data: {
      provider: job.data.provider,
      websiteId: job.data.websiteId,
      workspaceId: job.data.workspaceId,
      dateRange: job.data.dateRange,
    },
  };
}

/**
 * Cancel or remove a pending or active BullMQ job.
 */
export async function cancelSyncJob(jobId) {
  const queue = getSyncQueue();
  const job = await queue.getJob(jobId);
  if (!job) return false;

  const state = await job.getState();
  if (['completed', 'failed'].includes(state)) {
    return false;
  }

  await job.remove();
  logger.info(`Cancelled BullMQ job ${jobId}`);
  return true;
}

/**
 * Gracefully close the BullMQ queue connection.
 */
export async function closeSyncQueue() {
  if (syncQueue) {
    try {
      await syncQueue.close();
    } finally {
      syncQueue = null;
    }
  }
}

export default {
  getSyncQueue,
  addSyncJob,
  getJobStatus,
  cancelSyncJob,
  closeSyncQueue,
};
