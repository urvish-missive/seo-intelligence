// backend/src/modules/websites/website.routes.js
import { Router } from 'express';
import * as websiteController from './website.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { requireWorkspaceAccess } from '../../middleware/tenantIsolation.js';
import { validateBody } from '../../middleware/validateRequest.js';
import { createWebsiteSchema, updateWebsiteSchema } from './website.validation.js';

const router = Router();

// Workspace-wide website directory
router.get('/workspaces/:workspaceId/websites', authenticate, requireWorkspaceAccess, requirePermission('websites.view'), websiteController.listWebsites);

// Client-specific website operations
router.get('/workspaces/:workspaceId/clients/:clientId/websites', authenticate, requireWorkspaceAccess, requirePermission('websites.view'), websiteController.listWebsites);
router.post('/workspaces/:workspaceId/clients/:clientId/websites', authenticate, requireWorkspaceAccess, requirePermission('websites.create'), validateBody(createWebsiteSchema), websiteController.createWebsite);

// Specific website operations
router.get('/workspaces/:workspaceId/websites/:websiteId', authenticate, requireWorkspaceAccess, requirePermission('websites.view'), websiteController.getWebsite);
router.patch('/workspaces/:workspaceId/websites/:websiteId', authenticate, requireWorkspaceAccess, requirePermission('websites.update'), validateBody(updateWebsiteSchema), websiteController.updateWebsite);
router.patch('/workspaces/:workspaceId/websites/:websiteId/archive', authenticate, requireWorkspaceAccess, requirePermission('websites.archive'), websiteController.archiveWebsite);
router.delete('/workspaces/:workspaceId/websites/:websiteId', authenticate, requireWorkspaceAccess, requirePermission('websites.delete'), websiteController.deleteWebsite);

export default router;
