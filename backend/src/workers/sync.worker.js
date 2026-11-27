// backend/src/workers/sync.worker.js
// BullMQ Worker for processing Google Analytics 4, Google Search Console, and Microsoft Clarity sync jobs.
// Handles concurrency controls, exponential backoff, error classification, checkpoints, and graceful shutdown.

import { Worker, DelayedError } from 'bullmq';
import { SYNC_QUEUE_NAME, getBullMQConnection } from '../queues/queue.config.js';
import { syncLockService } from '../services/sync/syncLock.service.js';
import { ga4DataService } from '../modules/integrations/ga4/ga4Data.service.js';
import { gscDataService } from '../modules/integrations/gsc/gscData.service.js';
import { clarityImportService } from '../modules/integrations/clarity/clarityImport.service.js';
import { addAnalysisJob } from '../modules/seo-analysis/queues/seo-analysis.queue.js';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';

// When another sync holds the lock: wait this long, up to this many times
// (10 x 1 min outlasts the 5-minute lock left behind by a crash or restart).
const LOCK_RETRY_DELAY_MS = 60 * 1000;
const MAX_LOCK_DEFERRALS = 10;

let syncWorker = null;

/**
 * Execute provider-specific synchronisation.
 */
async function processSyncJob(job, token) {
  const {
    syncJobId,
    workspaceId,
    websiteId,
    provider,
    dateRange,
    user,
    preset,
    numOfDays,
  } = job.data;

  logger.info(`[SyncWorker] Starting job ${job.id} | Provider: ${provider} | Website: ${websiteId}`);

  // 1. Acquire distributed lock to prevent duplicate concurrent runs
  const lock = await syncLockService.acquireLock(websiteId, provider);
  if (!lock.acquired) {
    // The lock may belong to a sync that is still running, or be left over
    // from a server restart mid-sync (it expires after 5 minutes). Wait and
    // try again rather than using up the job's retries within seconds.
    const deferrals = (job.data.lockDeferrals || 0) + 1;
    if (deferrals <= MAX_LOCK_DEFERRALS && token) {
      logger.warn(
        `[SyncWorker] ${provider} sync for website ${websiteId} is locked; retrying in ${LOCK_RETRY_DELAY_MS / 1000}s (${deferrals}/${MAX_LOCK_DEFERRALS})`
      );
      await job.updateData({ ...job.data, lockDeferrals: deferrals });
      if (syncJobId) {
        await prisma.syncJob
          .update({ where: { id: syncJobId }, data: { status: 'PENDING' } })
          .catch(() => {});
      }
      await job.moveToDelayed(Date.now() + LOCK_RETRY_DELAY_MS, token);
      throw new DelayedError();
    }
    const msg = `Job deferred: another sync is actively running for website ${websiteId} and provider ${provider}`;
    logger.warn(`[SyncWorker] ${msg}`);
    if (syncJobId) {
      await prisma.syncJob
        .update({ where: { id: syncJobId }, data: { status: 'FAILED', completedAt: new Date(), error: msg } })
        .catch(() => {});
    }
    throw new Error(msg);
  }

  // 2. Mark SyncJob as RUNNING in MySQL
  if (syncJobId) {
    await prisma.syncJob.update({
      where: { id: syncJobId },
      data: {
        status: 'PROCESSING',
        startedAt: new Date(),
        attempts: job.attemptsMade + 1,
      },
    }).catch((e) => logger.warn(`Could not update syncJob status: ${e.message}`));
  }

  let result = null;
  const startedAt = new Date();

  try {
    // 3. Delegate to provider integration service
    switch (provider.toUpperCase()) {
      case 'GA4': {
        result = await ga4DataService.importGA4Data({
          workspaceId,
          websiteId,
          startDate: dateRange?.startDate,
          endDate: dateRange?.endDate,
          user: user || { id: 'system-scheduler' },
        });
        break;
      }

      case 'GSC': {
        result = await gscDataService.importGSCData({
          workspaceId,
          websiteId,
          startDate: dateRange?.startDate,
          endDate: dateRange?.endDate,
          user: user || { id: 'system-scheduler' },
        });
        break;
      }

      case 'CLARITY': {
        result = await clarityImportService.executeManualImport({
          workspaceId,
          websiteId,
          numOfDays: numOfDays || 1,
          preset: preset || 'OVERVIEW',
          user: user || { id: 'system-scheduler' },
        });
        break;
      }

      default:
        throw new Error(`Unsupported sync provider "${provider}"`);
    }

    const recordsProcessed = (result?.rowsInserted || 0) + (result?.rowsUpdated || 0) + (result?.rowCount || 0);

    // 4. Update SyncCheckpoint in MySQL
    await prisma.syncCheckpoint.upsert({
      where: {
        websiteId_provider: {
          websiteId,
          provider: provider.toUpperCase(),
        },
      },
      update: {
        lastSuccessfulDate: dateRange?.endDate || new Date().toISOString().split('T')[0],
        lastSuccessfulSyncAt: new Date(),
        syncMetadataJson: JSON.stringify({
          rowsFetched: result?.rowsFetched || result?.rowCount || 0,
          recordsProcessed,
          apiCallsUsed: result?.apiCallsUsed || 1,
        }),
      },
      create: {
        websiteId,
        provider: provider.toUpperCase(),
        lastSuccessfulDate: dateRange?.endDate || new Date().toISOString().split('T')[0],
        lastSuccessfulSyncAt: new Date(),
        syncMetadataJson: JSON.stringify({
          rowsFetched: result?.rowsFetched || result?.rowCount || 0,
          recordsProcessed,
          apiCallsUsed: result?.apiCallsUsed || 1,
        }),
      },
    }).catch((e) => logger.warn(`Could not update checkpoint: ${e.message}`));

    // 5. Mark SyncJob as COMPLETED in MySQL
    if (syncJobId) {
      await prisma.syncJob.update({
        where: { id: syncJobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          recordsFetched: result?.rowsFetched || result?.rowCount || 0,
          recordsStored: recordsProcessed,
          error: null,
        },
      }).catch((e) => logger.warn(`Could not update syncJob completion: ${e.message}`));
    }

    logger.info(
      `[SyncWorker] Finished job ${job.id} successfully (${recordsProcessed} records processed)`
    );

    // Automatically enqueue background analysis to keep SEO findings updated
    try {
      await addAnalysisJob({
        workspaceId,
        websiteId,
        analysisType: 'AUTO_POST_SYNC',
        userId: user?.id || null,
      });
    } catch (analysisQueueErr) {
      logger.warn(`Could not enqueue auto-analysis job: ${analysisQueueErr.message}`);
    }

    return {
      success: true,
      provider,
      websiteId,
      recordsProcessed,
      details: result,
    };
  } catch (err) {
    const isClarityQuota = err.message?.includes('daily quota limit reached') || err.message?.includes('429');
    const isAuthFailure = err.status === 401 || err.status === 403 || err.message?.includes('token') || err.message?.includes('revoked');

    logger.error(`[SyncWorker] Job ${job.id} failed: ${err.message}`);

    // Update SyncJob as FAILED
    if (syncJobId) {
      await prisma.syncJob.update({
        where: { id: syncJobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error: err.message,
        },
      }).catch((e) => logger.warn(`Could not record job failure: ${e.message}`));
    }

    // If Clarity quota or permanent Auth failure: do NOT retry automatically in BullMQ
    if (isClarityQuota || isAuthFailure) {
      job.opts.attempts = 1; // Prevent BullMQ retry loop
    }

    throw err;
  } finally {
    // 6. Always release distributed lock
    await syncLockService.releaseLock(websiteId, provider, lock.lockId);
  }
}

/**
 * Initialize the singleton BullMQ Sync Worker.
 */
export function startSyncWorker(concurrency = 5) {
  if (syncWorker) {
    return syncWorker;
  }

  const connection = getBullMQConnection();

  syncWorker = new Worker(SYNC_QUEUE_NAME, processSyncJob, {
    connection,
    concurrency,
    limiter: {
      max: 10,
      duration: 1000, // Max 10 jobs per second
    },
  });

  syncWorker.on('completed', (job) => {
    logger.info(`[SyncWorker] Job ${job.id} marked COMPLETED in queue`);
  });

  syncWorker.on('failed', (job, err) => {
    logger.warn(`[SyncWorker] Job ${job?.id} FAILED: ${err.message} (attempt ${job?.attemptsMade}/${job?.opts?.attempts})`);
  });

  syncWorker.on('error', (err) => {
    logger.warn(`[SyncWorker] Worker error: ${err.message}`);
  });

  logger.info(`[SyncWorker] Initialized and listening on queue "${SYNC_QUEUE_NAME}" (concurrency: ${concurrency})`);
  return syncWorker;
}

/**
 * Gracefully close the BullMQ worker.
 */
export async function closeSyncWorker() {
  if (syncWorker) {
    try {
      logger.info('Closing SyncWorker gracefully…');
      await syncWorker.close();
    } finally {
      syncWorker = null;
    }
  }
}

export default {
  startSyncWorker,
  closeSyncWorker,
  processSyncJob,
};
