// backend/src/middleware/rbac.js
// Re-export RBAC permission guards for consistent import resolution across modules.

export {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
} from './requirePermission.js';
