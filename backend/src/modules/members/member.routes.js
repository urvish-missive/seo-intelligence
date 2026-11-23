// backend/src/modules/members/member.routes.js
import { Router } from 'express';
import * as memberController from './member.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { requireWorkspaceAccess } from '../../middleware/tenantIsolation.js';
import { validateBody } from '../../middleware/validateRequest.js';
import {
  inviteMemberSchema,
  updateMemberRoleSchema,
  acceptInvitationSchema,
} from './member.validation.js';

const router = Router();

// Public invitation acceptance
router.post('/invitations/:token/accept', validateBody(acceptInvitationSchema), memberController.acceptInvitation);

// Workspace-scoped member endpoints
router.get('/workspaces/:workspaceId/members', authenticate, requireWorkspaceAccess, requirePermission('members.view'), memberController.listMembers);
router.patch('/workspaces/:workspaceId/members/:memberId', authenticate, requireWorkspaceAccess, requirePermission('members.update'), validateBody(updateMemberRoleSchema), memberController.updateMember);
router.delete('/workspaces/:workspaceId/members/:memberId', authenticate, requireWorkspaceAccess, requirePermission('members.remove'), memberController.removeMember);

// Workspace-scoped invitation management
router.post('/workspaces/:workspaceId/invitations', authenticate, requireWorkspaceAccess, requirePermission('members.invite'), validateBody(inviteMemberSchema), memberController.inviteMember);
router.get('/workspaces/:workspaceId/invitations', authenticate, requireWorkspaceAccess, requirePermission('members.view'), memberController.listInvitations);
router.post('/workspaces/:workspaceId/invitations/:invitationId/resend', authenticate, requireWorkspaceAccess, requirePermission('members.invite'), memberController.resendInvitation);
router.delete('/workspaces/:workspaceId/invitations/:invitationId', authenticate, requireWorkspaceAccess, requirePermission('members.remove'), memberController.revokeInvitation);

export default router;
