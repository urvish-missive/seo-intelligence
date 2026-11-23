// backend/src/middleware/tenantContext.js
// Backward-compatible alias for requireWorkspaceAccess.

export {
  requireWorkspaceAccess as requireWorkspace,
  requireWorkspaceAccess,
  requireClientAccess,
  requireWebsiteAccess,
} from './tenantIsolation.js';
