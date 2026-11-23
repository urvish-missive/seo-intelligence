// backend/src/modules/workspaces/workspace.routes.js
import { Router } from 'express';
import * as workspaceController from './workspace.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { requireWorkspaceAccess } from '../../middleware/tenantIsolation.js';
import { validateBody } from '../../middleware/validateRequest.js';
import { createWorkspaceSchema, updateWorkspaceSchema } from './workspace.validation.js';

const router = Router();

// Global for authenticated user
router.get('/', authenticate, workspaceController.listWorkspaces);
router.post('/', authenticate, requirePermission('workspace.manage'), validateBody(createWorkspaceSchema), workspaceController.createWorkspace);

// Specific workspace routes
router.get('/:workspaceId', authenticate, requireWorkspaceAccess, requirePermission('workspace.view'), workspaceController.getWorkspace);
router.patch('/:workspaceId', authenticate, requireWorkspaceAccess, requirePermission('workspace.update'), validateBody(updateWorkspaceSchema), workspaceController.updateWorkspace);
router.get('/:workspaceId/stats', authenticate, requireWorkspaceAccess, requirePermission('workspace.view'), workspaceController.getWorkspaceStats);
router.post('/:workspaceId/switch', authenticate, workspaceController.switchWorkspace);

export default router;
