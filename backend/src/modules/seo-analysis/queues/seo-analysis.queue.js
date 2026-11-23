// backend/src/modules/seo-analysis/queues/seo-analysis.queue.js
// BullMQ queue producer for dispatching background SEO Analysis Engine jobs.

import { Queue } from 'bullmq';
import { defaultJobOptions, getBullMQConnection } from '../../../queues/queue.config.js';
import logger from '../../../utils/logger.js';

export const ANALYSIS_QUEUE_NAME = 'missive-seo-analysis';

let analysisQueue = null;

export function getAnalysisQueue() {
  if (!analysisQueue) {
    const connection = getBullMQConnection();
    analysisQueue = new Queue(ANALYSIS_QUEUE_NAME, {
      connection,
      defaultJobOptions,
    });

    analysisQueue.on('error', (err) => {
      logger.warn(`BullMQ Analysis Queue Error: ${err.message}`);
    });
  }
  return analysisQueue;
}

/**
 * Push an SEO analysis task into the background queue.
 */
export async function addAnalysisJob(payload, customOptions = {}) {
  const queue = getAnalysisQueue();
  const jobName = `analysis:${payload.websiteId}`;
  const jobId = customOptions.jobId || `analysis:${payload.websiteId}:${Date.now()}`;

  const job = await queue.add(jobName, payload, {
    ...defaultJobOptions,
    jobId,
    ...customOptions,
  });

  logger.info(`Queued BullMQ SEO Analysis job ${job.id} for website ${payload.websiteId}`);
  return job;
}

export async function getAnalysisJobStatus(jobId) {
  const queue = getAnalysisQueue();
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
    data: job.data,
  };
}

export default {
  ANALYSIS_QUEUE_NAME,
  getAnalysisQueue,
  addAnalysisJob,
  getAnalysisJobStatus,
};
