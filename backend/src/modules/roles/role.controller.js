// backend/src/modules/roles/role.controller.js
import { roleService } from './role.service.js';
import { successResponse, createdResponse } from '../../utils/apiResponse.js';

export async function listRoles(req, res, next) {
  try {
    const roles = await roleService.listRoles(req.params.workspaceId);
    return successResponse(res, roles, 'Roles retrieved');
  } catch (err) {
    next(err);
  }
}

export async function listPermissions(req, res, next) {
  try {
    const permissions = await roleService.listPermissions();
    return successResponse(res, permissions, 'System permissions');
  } catch (err) {
    next(err);
  }
}

export async function createRole(req, res, next) {
  try {
    const role = await roleService.createRole(req.params.workspaceId, req.body);
    return createdResponse(res, role, 'Role created successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateRole(req, res, next) {
  try {
    const role = await roleService.updateRole(req.params.workspaceId, req.params.roleId, req.body);
    return successResponse(res, role, 'Role updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function deleteRole(req, res, next) {
  try {
    const result = await roleService.deleteRole(req.params.workspaceId, req.params.roleId);
    return successResponse(res, null, result.message);
  } catch (err) {
    next(err);
  }
}
