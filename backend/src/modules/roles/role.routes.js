// backend/src/modules/roles/role.routes.js
import { Router } from 'express';
import * as roleController from './role.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { requireWorkspaceAccess } from '../../middleware/tenantIsolation.js';

const router = Router();

router.get('/workspaces/:workspaceId/roles', authenticate, requireWorkspaceAccess, requirePermission('roles.view'), roleController.listRoles);
router.get('/workspaces/:workspaceId/permissions', authenticate, requireWorkspaceAccess, requirePermission('roles.view'), roleController.listPermissions);
router.post('/workspaces/:workspaceId/roles', authenticate, requireWorkspaceAccess, requirePermission('roles.manage'), roleController.createRole);
router.patch('/workspaces/:workspaceId/roles/:roleId', authenticate, requireWorkspaceAccess, requirePermission('roles.manage'), roleController.updateRole);
router.delete('/workspaces/:workspaceId/roles/:roleId', authenticate, requireWorkspaceAccess, requirePermission('roles.manage'), roleController.deleteRole);

export default router;
