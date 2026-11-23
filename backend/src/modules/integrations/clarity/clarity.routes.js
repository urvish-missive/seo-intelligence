// backend/src/modules/integrations/clarity/clarity.routes.js
// Express routes for Microsoft Clarity integration, website mapping, manual imports, and offline analytics.

import { Router } from 'express';
import * as controller from './clarity.controller.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireWorkspaceAccess } from '../../../middleware/tenantIsolation.js';
import { validateBody } from '../../../middleware/validateRequest.js';
import {
  createClarityConnectionSchema,
  replaceClarityTokenSchema,
  mapClarityWebsiteSchema,
  clarityImportSchema,
} from './clarity.validation.js';

const router = Router();

// ─── Workspace Clarity Connection Management ───────────────────────────
router.post(
  '/workspaces/:workspaceId/integrations/clarity',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.manage'),
  validateBody(createClarityConnectionSchema),
  controller.createConnection
);

router.get(
  '/workspaces/:workspaceId/integrations/clarity',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.view'),
  controller.listConnections
);

router.get(
  '/workspaces/:workspaceId/integrations/clarity/:connectionId',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.view'),
  controller.getConnection
);

router.patch(
  '/workspaces/:workspaceId/integrations/clarity/:connectionId',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.manage'),
  validateBody(replaceClarityTokenSchema),
  controller.replaceToken
);

router.delete(
  '/workspaces/:workspaceId/integrations/clarity/:connectionId',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.manage'),
  controller.disconnectConnection
);

// ─── Website Mapping ──────────────────────────────────────────────────
router.post(
  '/workspaces/:workspaceId/websites/:websiteId/integrations/clarity',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.manage'),
  validateBody(mapClarityWebsiteSchema),
  controller.mapWebsite
);

router.delete(
  '/workspaces/:workspaceId/websites/:websiteId/integrations/clarity',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.manage'),
  controller.unmapWebsite
);

// ─── Manual Data Imports ──────────────────────────────────────────────
router.post(
  '/workspaces/:workspaceId/websites/:websiteId/clarity/import',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.sync'),
  validateBody(clarityImportSchema),
  controller.executeImport
);

router.get(
  '/workspaces/:workspaceId/websites/:websiteId/clarity/snapshots',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('websites.view'),
  controller.listSnapshots
);

router.get(
  '/workspaces/:workspaceId/websites/:websiteId/clarity/snapshots/:snapshotId',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('websites.view'),
  controller.getSnapshotById
);

// ─── Stored Offline Analytics ─────────────────────────────────────────
router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/clarity',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('websites.view'),
  controller.getClarityOverview
);

export default router;
