// backend/src/services/sync/syncOrchestrator.service.js
// Central orchestration service for manual and automated data synchronisation.
// Enforces tenant isolation, lock checking, queueing, fallback direct execution, and status inspection.

import prisma from '../../config/database.js';
import { addSyncJob, cancelSyncJob } from '../../queues/sync.queue.js';
import { syncLockService } from './syncLock.service.js';
import { isRedisAvailable } from '../../config/redis.js';
import { ga4DataService } from '../../modules/integrations/ga4/ga4Data.service.js';
import { gscDataService } from '../../modules/integrations/gsc/gscData.service.js';
import { clarityImportService } from '../../modules/integrations/clarity/clarityImport.service.js';
import { getEffectiveCallsToday } from '../../modules/integrations/clarity/clarityConnection.service.js';
import { NotFoundError, BadRequestError, AppError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

const VALID_SYNC_JOB_TYPES = new Set([
  'GA4_HISTORICAL',
  'GA4_INCREMENTAL',
  'GSC_HISTORICAL',
  'GSC_INCREMENTAL',
  'CLARITY_SYNC',
  'REPORT_GENERATION',
]);

function resolveSyncJobType(provider, requestedJobType, dateRange) {
  if (requestedJobType && VALID_SYNC_JOB_TYPES.has(requestedJobType)) {
    return requestedJobType;
  }

  const prov = (provider || '').toUpperCase();
  if (prov === 'CLARITY') {
    return 'CLARITY_SYNC';
  }
  if (prov === 'GA4') {
    return dateRange?.startDate ? 'GA4_HISTORICAL' : 'GA4_INCREMENTAL';
  }
  if (prov === 'GSC') {
    return dateRange?.startDate ? 'GSC_HISTORICAL' : 'GSC_INCREMENTAL';
  }

  return 'GA4_INCREMENTAL';
}

export class SyncOrchestratorService {
  /**
   * Trigger an incremental or manual sync for a website.
   */
  async triggerSync({
    workspaceId,
    websiteId,
    provider,
    dateRange,
    jobType = 'MANUAL',
    preset = 'OVERVIEW',
    numOfDays = 1,
    user,
  }) {
    const prov = provider.toUpperCase();
    if (!['GA4', 'GSC', 'CLARITY'].includes(prov)) {
      throw new BadRequestError(`Unsupported integration provider "${provider}". Must be GA4, GSC, or CLARITY.`);
    }

    const resolvedJobType = resolveSyncJobType(prov, jobType, dateRange);

    // 1. Verify target website belongs to workspace
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
      include: {
        integrations: {
          where: { integrationType: prov },
          include: {
            googleAccount: true,
            clarityConnection: true,
          },
        },
      },
    });

    if (!website) {
      throw new NotFoundError('Target website not found in this workspace.');
    }

    const connection = website.integrations[0];
    if (!connection || connection.status === 'NOT_CONNECTED') {
      throw new BadRequestError(`${prov} is not connected to website ${website.domain}.`);
    }

    // 2. Pre-flight check for Clarity: Quota limit guard
    if (prov === 'CLARITY') {
      const clarityConn = connection.clarityConnection;
      if (!clarityConn) {
        throw new BadRequestError('Clarity project connection details are missing.');
      }
      if (getEffectiveCallsToday(clarityConn) >= 10) {
        throw new AppError(
          'Microsoft Clarity daily export quota reached (10 requests per project per day). Please wait until the next UTC day.',
          429
        );
      }
    }

    // 3. Create SyncJob record in MySQL (starts as PENDING)
    const syncJob = await prisma.syncJob.create({
      data: {
        workspaceId,
        websiteId,
        connectionId: connection.id,
        provider: prov,
        jobType: resolvedJobType,
        status: 'PENDING',
        dateRangeStart: dateRange?.startDate || null,
        dateRangeEnd: dateRange?.endDate || null,
        scheduledAt: new Date(),
      },
    });

    const payload = {
      syncJobId: syncJob.id,
      workspaceId,
      websiteId,
      connectionId: connection.id,
      provider: prov,
      jobType: resolvedJobType,
      dateRange,
      preset,
      numOfDays,
      user: { id: user?.id, email: user?.email },
    };

    // 4. Dispatch job: If Redis is available, queue via BullMQ; otherwise run direct async task
    if (isRedisAvailable()) {
      try {
        const queuedJob = await addSyncJob(payload, {
          // BullMQ custom job ids must not contain ':'
          jobId: `sync-${websiteId}-${prov}-${syncJob.id}`,
        });

        // Status stays PENDING (valid SyncJobStatus) until the worker picks it up.
        // A failure here must not fall through to the direct runner: the job is already queued.
        await prisma.syncJob.update({
          where: { id: syncJob.id },
          data: { bullmqJobId: String(queuedJob.id) },
        }).catch((e) => logger.warn(`Could not store BullMQ job id: ${e.message}`));

        return {
          jobId: syncJob.id,
          bullmqJobId: queuedJob.id,
          provider: prov,
          status: 'QUEUED',
          mode: 'background_queue',
          message: `${prov} sync job successfully queued for background processing.`,
        };
      } catch (queueErr) {
        logger.warn(`Failed to push to BullMQ queue, executing in direct background: ${queueErr.message}`);
      }
    }

    // 5. Fallback: Run asynchronously in Node process if Redis is unavailable
    this.runDirectSyncAsync(syncJob.id, payload);

    return {
      jobId: syncJob.id,
      bullmqJobId: null,
      provider: prov,
      status: 'PROCESSING',
      mode: 'direct_async',
      message: `${prov} sync initiated directly in background.`,
    };
  }

  /**
   * Helper to execute a sync directly without blocking Express if Redis is unavailable.
   */
  runDirectSyncAsync(syncJobId, payload) {
    setImmediate(async () => {
      const { websiteId, provider, dateRange, workspaceId, user, preset, numOfDays } = payload;
      const lock = await syncLockService.acquireLock(websiteId, provider);
      if (!lock.acquired) return;

      await prisma.syncJob.update({
        where: { id: syncJobId },
        data: { status: 'PROCESSING', startedAt: new Date() },
      }).catch(() => {});

      try {
        let result;
        if (provider === 'GA4') {
          result = await ga4DataService.importGA4Data({
            workspaceId,
            websiteId,
            startDate: dateRange?.startDate,
            endDate: dateRange?.endDate,
            user,
          });
        } else if (provider === 'GSC') {
          result = await gscDataService.importGSCData({
            workspaceId,
            websiteId,
            startDate: dateRange?.startDate,
            endDate: dateRange?.endDate,
            user,
          });
        } else if (provider === 'CLARITY') {
          result = await clarityImportService.executeManualImport({
            workspaceId,
            websiteId,
            numOfDays,
            preset,
            user,
          });
        }

        const count = (result?.rowsInserted || 0) + (result?.rowsUpdated || 0) + (result?.rowCount || 0);

        await prisma.syncCheckpoint.upsert({
          where: { websiteId_provider: { websiteId, provider } },
          update: {
            lastSuccessfulDate: dateRange?.endDate || new Date().toISOString().split('T')[0],
            lastSuccessfulSyncAt: new Date(),
          },
          create: {
            websiteId,
            provider,
            lastSuccessfulDate: dateRange?.endDate || new Date().toISOString().split('T')[0],
            lastSuccessfulSyncAt: new Date(),
          },
        }).catch(() => {});

        await prisma.syncJob.update({
          where: { id: syncJobId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            recordsFetched: result?.rowsFetched || result?.rowCount || 0,
            recordsStored: count,
          },
        }).catch(() => {});
      } catch (err) {
        await prisma.syncJob.update({
          where: { id: syncJobId },
          data: { status: 'FAILED', completedAt: new Date(), error: err.message },
        }).catch(() => {});
      } finally {
        await syncLockService.releaseLock(websiteId, provider, lock.lockId);
      }
    });
  }

  /**
   * Get real-time synchronisation status across all providers for a website.
   */
  async getWebsiteSyncStatus(workspaceId, websiteId) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
      include: {
        integrations: {
          include: {
            googleAccount: {
              select: { email: true, status: true },
            },
            clarityConnection: {
              select: { projectId: true, projectName: true, apiCallsToday: true, apiCallsResetAt: true, status: true },
            },
          },
        },
        syncCheckpoints: true,
        syncSchedules: true,
      },
    });

    if (!website) {
      throw new NotFoundError('Website not found in this workspace.');
    }

    // Fetch latest 3 jobs
    const recentJobs = await prisma.syncJob.findMany({
      where: { websiteId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const checkpointMap = new Map(website.syncCheckpoints.map((c) => [c.provider, c]));
    const scheduleMap = new Map(website.syncSchedules.map((s) => [s.provider, s]));

    const providers = ['GA4', 'GSC', 'CLARITY'].map((p) => {
      const conn = website.integrations.find((i) => i.integrationType === p);
      const checkpoint = checkpointMap.get(p);
      const schedule = scheduleMap.get(p);

      return {
        provider: p,
        isConnected: ['CONNECTED', 'SYNCING'].includes(conn?.status),
        connectionStatus: conn?.status || 'NOT_CONNECTED',
        selectedProperty: conn?.selectedProperty || null,
        selectedPropertyName: conn?.selectedPropertyName || null,
        lastSuccessfulSyncAt: checkpoint?.lastSuccessfulSyncAt || conn?.lastSyncAt || null,
        lastSuccessfulDate: checkpoint?.lastSuccessfulDate || null,
        schedule: schedule
          ? {
              id: schedule.id,
              enabled: schedule.enabled,
              intervalMinutes: schedule.intervalMinutes,
              lastRunAt: schedule.lastRunAt,
              nextRunAt: schedule.nextRunAt,
            }
          : {
              id: null,
              enabled: true,
              intervalMinutes: 1440,
              lastRunAt: null,
              nextRunAt: null,
            },
        clarityQuota: p === 'CLARITY' && conn?.clarityConnection
          ? {
              callsToday: getEffectiveCallsToday(conn.clarityConnection),
              callsRemaining: Math.max(0, 10 - getEffectiveCallsToday(conn.clarityConnection)),
              limit: 10,
            }
          : null,
      };
    });

    return {
      websiteId,
      domain: website.domain,
      providers,
      recentJobs,
    };
  }

  /**
   * Retrieve paginated sync history for a website.
   */
  async getSyncHistory(workspaceId, websiteId, { limit = 20, offset = 0, provider } = {}) {
    const where = {
      websiteId,
      workspaceId,
      ...(provider ? { provider: provider.toUpperCase() } : {}),
    };

    const [total, jobs] = await Promise.all([
      prisma.syncJob.count({ where }),
      prisma.syncJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
    ]);

    return {
      total,
      limit: Number(limit),
      offset: Number(offset),
      jobs,
    };
  }

  /**
   * Retry a failed sync job.
   */
  async retrySyncJob(workspaceId, jobId, user) {
    const job = await prisma.syncJob.findFirst({
      where: { id: jobId, workspaceId },
    });

    if (!job) {
      throw new NotFoundError('Sync job not found.');
    }

    if (job.status === 'PROCESSING') {
      throw new BadRequestError('Cannot retry a job that is currently queued or in-flight.');
    }

    return this.triggerSync({
      workspaceId,
      websiteId: job.websiteId,
      provider: job.provider,
      dateRange: {
        startDate: job.dateRangeStart,
        endDate: job.dateRangeEnd,
      },
      jobType: job.jobType,
      user,
    });
  }

  /**
   * Cancel an active or pending sync job.
   */
  async cancelSyncJob(workspaceId, jobId) {
    const job = await prisma.syncJob.findFirst({
      where: { id: jobId, workspaceId },
    });

    if (!job) {
      throw new NotFoundError('Sync job not found.');
    }

    if (['COMPLETED', 'CANCELLED'].includes(job.status)) {
      throw new BadRequestError(`Cannot cancel a job that is already ${job.status}.`);
    }

    if (job.bullmqJobId) {
      await cancelSyncJob(job.bullmqJobId);
    }

    const updated = await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        error: 'Job cancelled by user request.',
      },
    });

    return updated;
  }
}

export const syncOrchestratorService = new SyncOrchestratorService();
export default syncOrchestratorService;
