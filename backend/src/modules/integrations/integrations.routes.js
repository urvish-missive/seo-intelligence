// backend/src/modules/integrations/integrations.routes.js
// Express routes for Google OAuth, discovery, website integration binding, and data import.

import { Router } from 'express';
import * as controller from './integrations.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { requireWorkspaceAccess } from '../../middleware/tenantIsolation.js';

const router = Router();

// ─── Public OAuth Callback ───────────────────────────────────────────
router.get('/integrations/google/callback', controller.handleGoogleCallback);

// ─── Workspace Google Account Management ──────────────────────────────
router.get(
  '/workspaces/:workspaceId/integrations/google/auth-url',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.manage'),
  controller.getGoogleAuthUrl
);

router.get(
  '/workspaces/:workspaceId/integrations/google/accounts',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.view'),
  controller.listGoogleAccounts
);

router.delete(
  '/workspaces/:workspaceId/integrations/google/accounts/:accountId',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.manage'),
  controller.disconnectGoogleAccount
);

// ─── Property Discovery ───────────────────────────────────────────────
router.get(
  '/workspaces/:workspaceId/integrations/google/accounts/:accountId/ga4-properties',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.view'),
  controller.listGA4Properties
);

router.get(
  '/workspaces/:workspaceId/integrations/google/accounts/:accountId/gsc-sites',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.view'),
  controller.listGSCSites
);

// ─── Website Integration Association ──────────────────────────────────
router.get(
  '/workspaces/:workspaceId/websites/:websiteId/integrations',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.view'),
  controller.getWebsiteIntegrations
);

router.post(
  '/workspaces/:workspaceId/websites/:websiteId/integrations/connect',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.manage'),
  controller.connectWebsiteProperty
);

router.post(
  '/workspaces/:workspaceId/websites/:websiteId/integrations/disconnect',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.manage'),
  controller.disconnectWebsiteProperty
);

// ─── Manual Data Sync / Import ────────────────────────────────────────
router.post(
  '/workspaces/:workspaceId/websites/:websiteId/integrations/sync',
  authenticate,
  requireWorkspaceAccess,
  requirePermission('integrations.sync'),
  controller.triggerManualSync
);

export default router;
