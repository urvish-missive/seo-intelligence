// backend/src/modules/seo-analysis/workers/seo-analysis.worker.js
// BullMQ Worker for executing background SEO Analysis Engine jobs.

import { Worker } from 'bullmq';
import { ANALYSIS_QUEUE_NAME } from '../queues/seo-analysis.queue.js';
import { getBullMQConnection } from '../../../queues/queue.config.js';
import { seoAnalysisService } from '../services/seo-analysis.service.js';
import logger from '../../../utils/logger.js';

let analysisWorker = null;

async function processAnalysisJob(job) {
  const { workspaceId, websiteId, startDate, endDate, analysisType, userId } = job.data;
  logger.info(`[AnalysisWorker] Processing analysis job ${job.id} for website ${websiteId}`);

  const result = await seoAnalysisService.runAnalysis(workspaceId, websiteId, {
    startDate,
    endDate,
    analysisType,
    userId,
  });

  logger.info(
    `[AnalysisWorker] Completed analysis job ${job.id}: ${result.findingsCount} findings generated.`
  );

  return {
    success: true,
    websiteId,
    findingsCount: result.findingsCount,
    runId: result.run.id,
  };
}

export function startAnalysisWorker() {
  if (analysisWorker) return analysisWorker;

  const connection = getBullMQConnection();
  analysisWorker = new Worker(ANALYSIS_QUEUE_NAME, processAnalysisJob, {
    connection,
    concurrency: 2,
  });

  analysisWorker.on('completed', (job, result) => {
    logger.info(`[AnalysisWorker] Job ${job.id} completed successfully`);
  });

  analysisWorker.on('failed', (job, err) => {
    logger.error(`[AnalysisWorker] Job ${job?.id} failed: ${err.message}`);
  });

  analysisWorker.on('error', (err) => {
    logger.warn(`[AnalysisWorker] Worker connection warning: ${err.message}`);
  });

  logger.info('[AnalysisWorker] SEO Analysis Worker initialized and listening');
  return analysisWorker;
}

export async function stopAnalysisWorker() {
  if (analysisWorker) {
    logger.info('[AnalysisWorker] Stopping SEO Analysis Worker...');
    await analysisWorker.close();
    analysisWorker = null;
    logger.info('[AnalysisWorker] SEO Analysis Worker stopped');
  }
}

export default {
  startAnalysisWorker,
  stopAnalysisWorker,
};
