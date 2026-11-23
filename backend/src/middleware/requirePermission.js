// backend/src/middleware/requirePermission.js
// Dynamic RBAC Permission Verification Middleware.

import { ForbiddenError } from './errorHandler.js';

/**
 * Require a specific permission (e.g. 'clients.create', 'websites.view')
 * Super Admin bypasses all checks.
 */
export function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'));
    }

    // Super Admin has unrestricted access
    if (req.user.role === 'super_admin' || req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    if (!userPermissions.includes(permissionKey)) {
      return next(new ForbiddenError(`Forbidden: Missing permission "${permissionKey}"`));
    }

    next();
  };
}

/**
 * Require at least one permission from a list
 */
export function requireAnyPermission(permissionKeys = []) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'));
    }

    if (req.user.role === 'super_admin' || req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const hasAny = permissionKeys.some(k => userPermissions.includes(k));

    if (!hasAny) {
      return next(new ForbiddenError(`Forbidden: Requires one of [${permissionKeys.join(', ')}]`));
    }

    next();
  };
}

/**
 * Require all permissions from a list
 */
export function requireAllPermissions(permissionKeys = []) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'));
    }

    if (req.user.role === 'super_admin' || req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const hasAll = permissionKeys.every(k => userPermissions.includes(k));

    if (!hasAll) {
      return next(new ForbiddenError(`Forbidden: Requires all permissions [${permissionKeys.join(', ')}]`));
    }

    next();
  };
}
