// backend/src/mcp/auth/mcp-user-context.js
// Tenant isolation and website authorization validator for MCP operations.

import prisma from '../../config/database.js';
import { ForbiddenError, NotFoundError } from '../../middleware/errorHandler.js';

export class MCPUserContext {
  /**
   * Verify that the authenticated user has permission to access the target website.
   * Enforces client-assignment scoping for non-admin agency members.
   *
   * @param {object} user - Authenticated user context from token
   * @param {string} workspaceId - Workspace ID derived from authenticated context
   * @param {string} websiteId - Target website ID
   * @returns {Promise<object>} - Validated website record
   */
  static async validateWebsiteAccess(user, workspaceId, websiteId) {
    if (!websiteId) {
      throw new NotFoundError('Website ID is required for this operation.');
    }

    const isGlobalAdmin = ['super_admin', 'admin', 'SUPER_ADMIN', 'ADMIN'].includes(user?.role);

    const where = {
      id: websiteId,
      workspaceId,
      ...(!isGlobalAdmin && user?.id
        ? {
            client: {
              members: {
                some: { userId: user.id },
              },
            },
          }
        : {}),
    };

    const website = await prisma.website.findFirst({
      where,
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!website) {
      throw new ForbiddenError(
        `Access denied. Website "${websiteId}" does not exist in workspace or you are not assigned to its client.`
      );
    }

    return website;
  }

  /**
   * Verify that the user possesses a specific RBAC permission.
   */
  static enforcePermission(user, requiredPermission) {
    if (!user) {
      throw new ForbiddenError('Unauthenticated MCP request.');
    }

    // Super Admin bypass
    if (['super_admin', 'SUPER_ADMIN'].includes(user.role)) {
      return true;
    }

    const userPermissions = user.permissions || [];
    if (!userPermissions.includes(requiredPermission)) {
      throw new ForbiddenError(
        `Insufficient permissions. Action requires "${requiredPermission}".`
      );
    }

    return true;
  }
}
