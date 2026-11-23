// backend/src/workers/index.js
// Dedicated standalone entrypoint for background BullMQ workers.
// Used in production when worker processes are isolated from the web API server.

import prisma from '../config/database.js';
import { getRedisClient, closeRedisClient } from '../config/redis.js';
import { startSyncWorker, closeSyncWorker } from './sync.worker.js';
import { startAnalysisWorker, stopAnalysisWorker } from '../modules/seo-analysis/workers/seo-analysis.worker.js';
import { startReportWorker, stopReportWorker } from '../modules/reports/workers/report.worker.js';
import { closeSyncQueue } from '../queues/sync.queue.js';
import logger from '../utils/logger.js';

logger.info('Initializing Standalone Missive SEO Background Worker Process...');

async function startWorkers() {
  try {
    await prisma.$connect();
    logger.info('[Workers] Database connected successfully.');
  } catch (err) {
    logger.error('[Workers] Database connection failed:', { error: err.message });
    process.exit(1);
  }

  const redis = getRedisClient();
  if (!redis) {
    logger.error('[Workers] Redis client not available. Cannot start background workers.');
    process.exit(1);
  }

  // Start all 3 BullMQ workers
  const syncWorker = startSyncWorker();
  const analysisWorker = startAnalysisWorker();
  const reportWorker = startReportWorker();

  logger.info(`
╔════════════════════════════════════════════════════╗
║     Missive SEO Intelligence Background Workers    ║
╠════════════════════════════════════════════════════╣
║  Sync Worker:      Active (Concurrency: 3)         ║
║  Analysis Worker:  Active (Concurrency: 2)         ║
║  Report Worker:    Active (Concurrency: 2)         ║
║  Redis Connection: OK                              ║
║  Mode:             Standalone Worker Cluster       ║
╚════════════════════════════════════════════════════╝
  `);

  async function shutdown(signal) {
    logger.info(`[Workers] ${signal} received — gracefully stopping workers...`);
    try {
      await stopReportWorker();
      await stopAnalysisWorker();
      await closeSyncWorker();
      await closeSyncQueue();
      await closeRedisClient();
      await prisma.$disconnect();
      logger.info('[Workers] All background workers stopped cleanly.');
      process.exit(0);
    } catch (err) {
      logger.error('[Workers] Error during shutdown:', { error: err.message });
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('[Workers] Unhandled rejection:', { reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('[Workers] Uncaught exception:', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

startWorkers();
