// backend/src/mcp/routes/mcp-admin.routes.js
// Admin management routes for MCP tokens, logs, and status.

import { Router } from 'express';
import { mcpAdminController } from '../controllers/mcp-admin.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireWorkspaceAccess } from '../../middleware/tenantIsolation.js';
import { requirePermission } from '../../middleware/requirePermission.js';

const router = Router();

router.use('/workspaces/:workspaceId', authenticate, requireWorkspaceAccess);

// 1. Status & Catalog
router.get(
  '/workspaces/:workspaceId/mcp/status',
  requirePermission('workspace.view'),
  (req, res, next) => mcpAdminController.getStatus(req, res, next)
);

router.get(
  '/workspaces/:workspaceId/mcp/catalog',
  requirePermission('workspace.view'),
  (req, res, next) => mcpAdminController.getCatalog(req, res, next)
);

// 2. Token Management
router.get(
  '/workspaces/:workspaceId/mcp/tokens',
  requirePermission('workspace.manage'),
  (req, res, next) => mcpAdminController.listTokens(req, res, next)
);

router.post(
  '/workspaces/:workspaceId/mcp/tokens',
  requirePermission('workspace.manage'),
  (req, res, next) => mcpAdminController.createToken(req, res, next)
);

router.delete(
  '/workspaces/:workspaceId/mcp/tokens/:tokenId',
  requirePermission('workspace.manage'),
  (req, res, next) => mcpAdminController.revokeToken(req, res, next)
);

// 3. Execution Logs
router.get(
  '/workspaces/:workspaceId/mcp/logs',
  requirePermission('workspace.view'),
  (req, res, next) => mcpAdminController.getLogs(req, res, next)
);

export default router;
