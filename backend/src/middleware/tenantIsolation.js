// backend/src/middleware/tenantIsolation.js
// Multi-tenant boundary enforcement for workspaces, clients, and websites.

import { ForbiddenError, NotFoundError } from './errorHandler.js';
import prisma from '../config/database.js';

/**
 * Verify user is an active member of the workspace specified in req.params or req.body.
 * If user is Super Admin in system, access is granted.
 */
export async function requireWorkspaceAccess(req, res, next) {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;

    if (!workspaceId) {
      return next(new ForbiddenError('Workspace ID context is required'));
    }

    // Super Admin has access to all workspaces
    if (req.user.role === 'super_admin' || req.user.role === 'SUPER_ADMIN') {
      req.workspaceId = workspaceId;
      return next();
    }

    // If matching active workspace in JWT
    if (req.user.workspaceId === workspaceId) {
      req.workspaceId = workspaceId;
      return next();
    }

    // Otherwise verify membership in database
    const membership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: req.user.id,
        },
      },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      return next(new ForbiddenError('Access denied: You are not an active member of this workspace'));
    }

    // Update active context on req.user
    req.workspaceId = workspaceId;
    req.user.workspaceId = workspaceId;
    req.user.role = membership.role.slug;
    req.user.roleId = membership.role.id;
    req.user.permissions = membership.role.permissions.map(rp => rp.permission.key);

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Verify client belongs to workspace AND user has authorization to view this client.
 * For Super Admin and Admin: all clients in workspace are accessible.
 * For SEO Manager, Executive, Viewer: client must be assigned to user in ClientMember table.
 */
export async function requireClientAccess(req, res, next) {
  try {
    const clientId = req.params.clientId || req.body.clientId;
    const workspaceId = req.params.workspaceId || req.workspaceId || req.user.workspaceId;

    if (!clientId) {
      return next(new ForbiddenError('Client ID is required'));
    }

    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        workspaceId,
      },
    });

    if (!client) {
      return next(new NotFoundError('Client'));
    }

    // Super Admin or Admin can access all workspace clients
    const isGlobalAdmin = ['super_admin', 'admin', 'SUPER_ADMIN', 'ADMIN'].includes(req.user.role);
    if (!isGlobalAdmin) {
      const assignment = await prisma.clientMember.findUnique({
        where: {
          clientId_userId: {
            clientId,
            userId: req.user.id,
          },
        },
      });

      if (!assignment) {
        return next(new ForbiddenError('Access denied: You are not assigned to this client'));
      }
    }

    req.client = client;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Verify website belongs to workspace AND user has authorization to access its client.
 * For Super Admin and Admin: all workspace websites are accessible.
 * For SEO Manager, Executive, Viewer: user must be assigned to the website's client in ClientMember table.
 */
export async function requireWebsiteAccess(req, res, next) {
  try {
    const websiteId = req.params.websiteId || req.body.websiteId || req.query.websiteId;
    const workspaceId = req.params.workspaceId || req.workspaceId || req.user.workspaceId;

    if (!websiteId) {
      return next(new ForbiddenError('Website ID context is required'));
    }

    const website = await prisma.website.findFirst({
      where: {
        id: websiteId,
        workspaceId,
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!website) {
      return next(new NotFoundError('Website'));
    }

    const isGlobalAdmin = ['super_admin', 'admin', 'SUPER_ADMIN', 'ADMIN'].includes(req.user.role);
    if (!isGlobalAdmin && req.user?.id) {
      const assignment = await prisma.clientMember.findUnique({
        where: {
          clientId_userId: {
            clientId: website.clientId,
            userId: req.user.id,
          },
        },
      });

      if (!assignment) {
        return next(new ForbiddenError('Access denied: You are not assigned to this website\'s client'));
      }
    }

    req.website = website;
    next();
  } catch (err) {
    next(err);
  }
}
