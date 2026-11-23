// backend/src/modules/members/member.controller.js
import { memberService } from './member.service.js';
import { successResponse, createdResponse } from '../../utils/apiResponse.js';

export async function listMembers(req, res, next) {
  try {
    const members = await memberService.listMembers(req.params.workspaceId);
    return successResponse(res, members, 'Members retrieved');
  } catch (err) {
    next(err);
  }
}

export async function inviteMember(req, res, next) {
  try {
    const result = await memberService.inviteMember(
      req.params.workspaceId,
      req.user.id,
      req.user.role,
      req.body
    );
    return createdResponse(res, result, 'Member invited successfully');
  } catch (err) {
    next(err);
  }
}

export async function listInvitations(req, res, next) {
  try {
    const invitations = await memberService.listInvitations(req.params.workspaceId);
    return successResponse(res, invitations, 'Pending invitations');
  } catch (err) {
    next(err);
  }
}

export async function resendInvitation(req, res, next) {
  try {
    const result = await memberService.resendInvitation(
      req.params.workspaceId,
      req.params.invitationId,
      req.user.id
    );
    return successResponse(res, result, result.message);
  } catch (err) {
    next(err);
  }
}

export async function revokeInvitation(req, res, next) {
  try {
    const result = await memberService.revokeInvitation(
      req.params.workspaceId,
      req.params.invitationId,
      req.user.id
    );
    return successResponse(res, null, result.message);
  } catch (err) {
    next(err);
  }
}

export async function acceptInvitation(req, res, next) {
  try {
    const result = await memberService.acceptInvitation(req.params.token, req.body);
    return successResponse(res, result, result.message);
  } catch (err) {
    next(err);
  }
}

export async function updateMember(req, res, next) {
  try {
    const updated = await memberService.updateMember(
      req.params.workspaceId,
      req.params.memberId,
      req.user.id,
      req.user.role,
      req.body
    );
    return successResponse(res, updated, 'Member updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function removeMember(req, res, next) {
  try {
    const result = await memberService.removeMember(
      req.params.workspaceId,
      req.params.memberId,
      req.user.id
    );
    return successResponse(res, null, result.message);
  } catch (err) {
    next(err);
  }
}
