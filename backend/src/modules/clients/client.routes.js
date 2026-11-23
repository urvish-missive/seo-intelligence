// backend/src/modules/clients/client.routes.js
import { Router } from 'express';
import * as clientController from './client.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { requireWorkspaceAccess, requireClientAccess } from '../../middleware/tenantIsolation.js';
import { validateBody } from '../../middleware/validateRequest.js';
import {
  createClientSchema,
  updateClientSchema,
  assignClientMemberSchema,
} from './client.validation.js';

const router = Router();

router.get('/workspaces/:workspaceId/clients', authenticate, requireWorkspaceAccess, requirePermission('clients.view'), clientController.listClients);
router.post('/workspaces/:workspaceId/clients', authenticate, requireWorkspaceAccess, requirePermission('clients.create'), validateBody(createClientSchema), clientController.createClient);
router.get('/workspaces/:workspaceId/clients/:clientId', authenticate, requireWorkspaceAccess, requireClientAccess, requirePermission('clients.view'), clientController.getClient);
router.patch('/workspaces/:workspaceId/clients/:clientId', authenticate, requireWorkspaceAccess, requireClientAccess, requirePermission('clients.update'), validateBody(updateClientSchema), clientController.updateClient);
router.patch('/workspaces/:workspaceId/clients/:clientId/archive', authenticate, requireWorkspaceAccess, requireClientAccess, requirePermission('clients.archive'), clientController.archiveClient);
router.delete('/workspaces/:workspaceId/clients/:clientId', authenticate, requireWorkspaceAccess, requireClientAccess, requirePermission('clients.delete'), clientController.deleteClient);

// Client member assignments
router.post('/workspaces/:workspaceId/clients/:clientId/members', authenticate, requireWorkspaceAccess, requireClientAccess, requirePermission('clients.assign'), validateBody(assignClientMemberSchema), clientController.assignMember);
router.delete('/workspaces/:workspaceId/clients/:clientId/members/:userId', authenticate, requireWorkspaceAccess, requireClientAccess, requirePermission('clients.assign'), clientController.removeMember);

export default router;
