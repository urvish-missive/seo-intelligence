// backend/src/modules/sync/sync.routes.js
// Express Router for synchronisation orchestration endpoints.

import { Router } from 'express';
import syncController from './sync.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/tenantContext.js';
import { requirePermission } from '../../middleware/requirePermission.js';

const router = Router();

// Public/System health check for Redis queue
router.get('/sync/health', (req, res, next) => syncController.getHealth(req, res, next));

// All subsequent routes require authentication and workspace scope
router.use('/workspaces/:workspaceId', requireAuth, requireWorkspace);

// Trigger a sync job (requires integrations.sync)
router.post(
  '/workspaces/:workspaceId/websites/:websiteId/sync/trigger',
  requirePermission('integrations.sync'),
  (req, res, next) => syncController.triggerSync(req, res, next)
);

// Get real-time sync status for a website (requires websites.view)
router.get(
  '/workspaces/:workspaceId/websites/:websiteId/sync/status',
  requirePermission('websites.view'),
  (req, res, next) => syncController.getStatus(req, res, next)
);

// Get paginated sync history for a website (requires websites.view)
router.get(
  '/workspaces/:workspaceId/websites/:websiteId/sync/history',
  requirePermission('websites.view'),
  (req, res, next) => syncController.getHistory(req, res, next)
);

// Retry a failed job (requires integrations.sync)
router.post(
  '/workspaces/:workspaceId/sync/jobs/:jobId/retry',
  requirePermission('integrations.sync'),
  (req, res, next) => syncController.retryJob(req, res, next)
);

// Cancel an active or pending job (requires integrations.sync)
router.post(
  '/workspaces/:workspaceId/sync/jobs/:jobId/cancel',
  requirePermission('integrations.sync'),
  (req, res, next) => syncController.cancelJob(req, res, next)
);

// Get sync schedules for a website (requires websites.view)
router.get(
  '/workspaces/:workspaceId/websites/:websiteId/sync/schedules',
  requirePermission('websites.view'),
  (req, res, next) => syncController.getSchedules(req, res, next)
);

// Update a sync schedule (requires integrations.manage)
router.put(
  '/workspaces/:workspaceId/websites/:websiteId/sync/schedules/:provider',
  requirePermission('integrations.manage'),
  (req, res, next) => syncController.updateSchedule(req, res, next)
);

export default router;
