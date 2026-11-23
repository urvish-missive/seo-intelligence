// backend/src/middleware/authorise.js
// Role-based access control middleware factory.

import { ForbiddenError } from './errorHandler.js';

// Role hierarchy — higher index = more permissions
const ROLE_HIERARCHY = {
  VIEWER: 0,
  SEO_EXECUTIVE: 1,
  SEO_MANAGER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

/**
 * Require a minimum role level.
 * Usage: router.get('/path', authenticate, requireRole('ADMIN'), controller)
 */
export function requireRole(minimumRole) {
  return (req, res, next) => {
    const userRoleLevel = ROLE_HIERARCHY[req.user?.role] ?? -1;
    const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? 99;

    if (userRoleLevel < requiredLevel) {
      return next(new ForbiddenError(`This action requires ${minimumRole} role or higher`));
    }
    next();
  };
}

/**
 * Require exact role(s).
 * Usage: requireRoles(['SUPER_ADMIN', 'ADMIN'])
 */
export function requireRoles(allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user?.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    next();
  };
}

/**
 * Verify user has access to the requested workspaceId.
 * Checks that req.user.workspaceId matches the workspace in context.
 */
export function requireWorkspaceAccess(req, res, next) {
  const workspaceId = req.params.workspaceId || req.body.workspaceId;
  if (workspaceId && workspaceId !== req.user?.workspaceId) {
    return next(new ForbiddenError('Access denied to this workspace'));
  }
  next();
}
