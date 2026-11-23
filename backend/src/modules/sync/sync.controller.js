// backend/src/modules/sync/sync.controller.js
// REST Controller for background sync jobs, status, history, schedules, and health.

import { syncOrchestratorService } from '../../services/sync/syncOrchestrator.service.js';
import { syncSchedulerService } from '../../services/sync/syncScheduler.service.js';
import { getRedisHealthSummary } from '../../utils/redisHealth.js';
import { BadRequestError } from '../../middleware/errorHandler.js';

export class SyncController {
  /**
   * POST /api/v1/workspaces/:workspaceId/websites/:websiteId/sync/trigger
   */
  async triggerSync(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { provider, dateRange, preset, numOfDays } = req.body;

      if (!provider) {
        throw new BadRequestError('Integration provider (GA4, GSC, or CLARITY) is required.');
      }

      const result = await syncOrchestratorService.triggerSync({
        workspaceId,
        websiteId,
        provider,
        dateRange,
        preset,
        numOfDays,
        jobType: 'MANUAL',
        user: req.user,
      });

      res.status(202).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/websites/:websiteId/sync/status
   */
  async getStatus(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const status = await syncOrchestratorService.getWebsiteSyncStatus(workspaceId, websiteId);

      res.json({
        success: true,
        data: status,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/websites/:websiteId/sync/history
   */
  async getHistory(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { limit, offset, provider } = req.query;

      const history = await syncOrchestratorService.getSyncHistory(workspaceId, websiteId, {
        limit,
        offset,
        provider,
      });

      res.json({
        success: true,
        data: history,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/workspaces/:workspaceId/sync/jobs/:jobId/retry
   */
  async retryJob(req, res, next) {
    try {
      const { workspaceId, jobId } = req.params;
      const result = await syncOrchestratorService.retrySyncJob(workspaceId, jobId, req.user);

      res.status(202).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/workspaces/:workspaceId/sync/jobs/:jobId/cancel
   */
  async cancelJob(req, res, next) {
    try {
      const { workspaceId, jobId } = req.params;
      const result = await syncOrchestratorService.cancelSyncJob(workspaceId, jobId);

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/websites/:websiteId/sync/schedules
   */
  async getSchedules(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const status = await syncOrchestratorService.getWebsiteSyncStatus(workspaceId, websiteId);

      res.json({
        success: true,
        data: status.providers.map((p) => ({
          provider: p.provider,
          schedule: p.schedule,
          isConnected: p.isConnected,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/v1/workspaces/:workspaceId/websites/:websiteId/sync/schedules/:provider
   */
  async updateSchedule(req, res, next) {
    try {
      const { workspaceId, websiteId, provider } = req.params;
      const { enabled, intervalMinutes, cronExpression } = req.body;

      const schedule = await syncSchedulerService.updateSchedule({
        workspaceId,
        websiteId,
        provider,
        enabled,
        intervalMinutes,
        cronExpression,
        user: req.user,
      });

      res.json({
        success: true,
        data: schedule,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/sync/health
   */
  async getHealth(req, res, next) {
    try {
      const health = await getRedisHealthSummary();
      res.json({
        success: true,
        data: health,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const syncController = new SyncController();
export default syncController;
