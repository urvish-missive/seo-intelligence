// backend/src/modules/workspaces/workspace.controller.js
import { workspaceService } from './workspace.service.js';
import { successResponse, createdResponse } from '../../utils/apiResponse.js';

export async function listWorkspaces(req, res, next) {
  try {
    const workspaces = await workspaceService.listUserWorkspaces(req.user.id);
    return successResponse(res, workspaces, 'Workspaces retrieved');
  } catch (err) {
    next(err);
  }
}

export async function getWorkspace(req, res, next) {
  try {
    const workspace = await workspaceService.getWorkspaceById(req.params.workspaceId, req.user.id);
    return successResponse(res, workspace, 'Workspace details');
  } catch (err) {
    next(err);
  }
}

export async function createWorkspace(req, res, next) {
  try {
    const workspace = await workspaceService.createWorkspace(req.user.id, req.body);
    return createdResponse(res, workspace, 'Workspace created successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateWorkspace(req, res, next) {
  try {
    const workspace = await workspaceService.updateWorkspace(
      req.params.workspaceId,
      req.user.id,
      req.body
    );
    return successResponse(res, workspace, 'Workspace updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceStats(req, res, next) {
  try {
    const stats = await workspaceService.getWorkspaceStats(req.params.workspaceId);
    return successResponse(res, stats, 'Workspace statistics');
  } catch (err) {
    next(err);
  }
}

export async function switchWorkspace(req, res, next) {
  try {
    const result = await workspaceService.switchWorkspace(req.user.id, req.params.workspaceId);
    return successResponse(res, result, 'Active workspace switched successfully');
  } catch (err) {
    next(err);
  }
}
