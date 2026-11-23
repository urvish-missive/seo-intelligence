// backend/src/server.js
// HTTP server entry point.

import { createApp } from './app.js';
import { env } from './config/environment.js';
import prisma from './config/database.js';
import { getRedisClient, closeRedisClient } from './config/redis.js';
import { startSyncWorker, closeSyncWorker } from './workers/sync.worker.js';
import { closeSyncQueue } from './queues/sync.queue.js';
import { startAnalysisWorker, stopAnalysisWorker } from './modules/seo-analysis/workers/seo-analysis.worker.js';
import { startReportWorker, stopReportWorker } from './modules/reports/workers/report.worker.js';
import { syncSchedulerService } from './services/sync/syncScheduler.service.js';
import logger from './utils/logger.js';

const app = createApp();

async function start() {
  // Test database connection before accepting requests
  try {
    await prisma.$connect();
    logger.info('Database: Connected successfully');
  } catch (err) {
    logger.error('Database: Failed to connect', { error: err.message });
    logger.error('Ensure MySQL is running and DATABASE_URL in .env is correct.');
    process.exit(1);
  }

  // Initialise Redis and background job processing (non-blocking)
  const redis = getRedisClient();
  if (redis) {
    startSyncWorker();
    startAnalysisWorker();
    startReportWorker();
  }

  // Initialize automated background sync scheduler
  await syncSchedulerService.initScheduler();

  const server = app.listen(env.PORT, () => {
    logger.info(`
╔════════════════════════════════════════════════════╗
║       Missive SEO Intelligence Platform            ║
║       Backend API Server                           ║
╠════════════════════════════════════════════════════╣
║  Status:   Running                                 ║
║  Port:     ${String(env.PORT).padEnd(40)}║
║  Mode:     ${env.NODE_ENV.padEnd(40)}║
║  API:      http://localhost:${env.PORT}/api/v1          ║
║  Health:   http://localhost:${env.PORT}/api/v1/health   ║
╚════════════════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  async function shutdown(signal) {
    logger.info(`${signal} received — shutting down gracefully`);
    syncSchedulerService.stopScheduler();
    await stopReportWorker();
    await stopAnalysisWorker();
    await closeSyncWorker();
    await closeSyncQueue();
    await closeRedisClient();

    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Database disconnected and background processors stopped');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', { reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

start();
