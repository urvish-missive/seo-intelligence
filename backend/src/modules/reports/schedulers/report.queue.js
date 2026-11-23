// backend/src/modules/reports/schedulers/report.queue.js
// BullMQ Queue Producer for Background Report Generation and Scheduled Runs.

import { Queue } from 'bullmq';
import { defaultJobOptions, getBullMQConnection } from '../../../queues/queue.config.js';
import logger from '../../../utils/logger.js';

export const REPORT_QUEUE_NAME = 'missive-seo-reports';

let reportQueue = null;

export function getReportQueue() {
  if (!reportQueue) {
    const connection = getBullMQConnection();
    reportQueue = new Queue(REPORT_QUEUE_NAME, {
      connection,
      defaultJobOptions,
    });

    reportQueue.on('error', (err) => {
      logger.warn(`BullMQ Report Queue Error: ${err.message}`);
    });
  }
  return reportQueue;
}

export function setReportQueue(queue) {
  reportQueue = queue;
}

/**
 * Enqueue an immediate report generation task.
 */
export async function addReportJob(payload, options = {}) {
  const queue = getReportQueue();
  const jobName = `generate:${payload.reportId}`;
  const jobId = options.jobId || `report:${payload.reportId}:${Date.now()}`;

  const job = await queue.add(jobName, payload, {
    ...defaultJobOptions,
    jobId,
    ...options,
  });

  logger.info(`Queued background report generation job ${job.id} for report ${payload.reportId}`);
  return job;
}

/**
 * Register or update a repeatable recurring schedule in BullMQ.
 */
export async function registerRepeatableSchedule({
  scheduleId,
  cronExpr,
  timezone = 'UTC',
  payload,
}) {
  const queue = getReportQueue();
  const jobName = `schedule:${scheduleId}`;

  // First remove existing repeatable job if any
  await removeRepeatableSchedule(scheduleId);

  // Add new repeatable job
  const job = await queue.add(
    jobName,
    { ...payload, scheduleId, isScheduledRun: true },
    {
      repeat: {
        pattern: cronExpr,
        tz: timezone,
      },
      jobId: `repeat:${scheduleId}`,
    }
  );

  logger.info(`Registered BullMQ repeatable schedule for ${scheduleId} with pattern ${cronExpr} (${timezone})`);
  return job;
}

/**
 * Remove a repeatable schedule from BullMQ.
 */
export async function removeRepeatableSchedule(scheduleId) {
  try {
    const queue = getReportQueue();
    const repeatableJobs = await queue.getRepeatableJobs();
    const existing = repeatableJobs.find(j => j.name === `schedule:${scheduleId}` || j.id === `repeat:${scheduleId}`);

    if (existing) {
      await queue.removeRepeatableByKey(existing.key);
      logger.info(`Removed BullMQ repeatable schedule ${scheduleId}`);
      return true;
    }
    return false;
  } catch (err) {
    logger.warn(`Failed to remove repeatable job ${scheduleId}: ${err.message}`);
    return false;
  }
}
