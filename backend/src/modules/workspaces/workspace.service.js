// backend/src/modules/workspaces/workspace.service.js
// Workspace service — creation, listing, updating, statistics, switching.

import prisma from '../../config/database.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../middleware/errorHandler.js';
import { signAccessToken } from '../auth/auth.utils.js';

export class WorkspaceService {
  /**
   * List all workspaces the user has access to
   */
  async listUserWorkspaces(userId) {
    const memberships = await prisma.membership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        workspace: {
          include: {
            _count: {
              select: {
                clients: true,
                websites: true,
                memberships: true,
              },
            },
          },
        },
        role: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map(m => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      description: m.workspace.description,
      logo: m.workspace.logo,
      timezone: m.workspace.timezone,
      status: m.workspace.status,
      isOwner: m.workspace.ownerId === userId,
      role: {
        id: m.role.id,
        name: m.role.name,
        slug: m.role.slug,
      },
      stats: {
        clientCount: m.workspace._count.clients,
        websiteCount: m.workspace._count.websites,
        memberCount: m.workspace._count.memberships,
      },
      joinedAt: m.joinedAt,
    }));
  }

  /**
   * Get workspace details
   */
  async getWorkspaceById(workspaceId, userId) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: {
            clients: true,
            websites: true,
            memberships: true,
          },
        },
      },
    });

    if (!workspace) throw new NotFoundError('Workspace');

    const membership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: { role: true },
    });

    return {
      ...workspace,
      isOwner: workspace.ownerId === userId,
      userRole: membership?.role || null,
      stats: {
        clientCount: workspace._count.clients,
        websiteCount: workspace._count.websites,
        memberCount: workspace._count.memberships,
      },
    };
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(userId, { name, description, timezone = 'UTC' }) {
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let slug = slugBase;
    let counter = 1;

    while (await prisma.workspace.findUnique({ where: { slug } })) {
      slug = `${slugBase}-${counter++}`;
    }

    // Find super_admin role
    let superAdminRole = await prisma.role.findFirst({
      where: { slug: 'super_admin' },
    });

    if (!superAdminRole) {
      superAdminRole = await prisma.role.create({
        data: {
          name: 'Super Admin',
          slug: 'super_admin',
          description: 'Full workspace administrative access',
          isSystem: true,
        },
      });
    }

    return prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name,
          slug,
          description,
          timezone,
          ownerId: userId,
          status: 'ACTIVE',
        },
      });

      await tx.membership.create({
        data: {
          workspaceId: workspace.id,
          userId,
          roleId: superAdminRole.id,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          userId,
          action: 'workspace.created',
          entityType: 'Workspace',
          entityId: workspace.id,
          metadata: { name, slug },
        },
      });

      return workspace;
    });
  }

  /**
   * Update workspace details
   */
  async updateWorkspace(workspaceId, userId, data) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundError('Workspace');

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: data.name !== undefined ? data.name : workspace.name,
        description: data.description !== undefined ? data.description : workspace.description,
        timezone: data.timezone !== undefined ? data.timezone : workspace.timezone,
        logo: data.logo !== undefined ? data.logo : workspace.logo,
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'workspace.updated',
        entityType: 'Workspace',
        entityId: workspaceId,
        metadata: data,
      },
    });

    return updated;
  }

  /**
   * Get workspace statistics
   */
  async getWorkspaceStats(workspaceId) {
    const [
      totalClients,
      activeClients,
      totalWebsites,
      activeWebsites,
      totalMembers,
    ] = await Promise.all([
      prisma.client.count({ where: { workspaceId } }),
      prisma.client.count({ where: { workspaceId, status: 'ACTIVE' } }),
      prisma.website.count({ where: { workspaceId } }),
      prisma.website.count({ where: { workspaceId, status: 'ACTIVE' } }),
      prisma.membership.count({ where: { workspaceId, status: 'ACTIVE' } }),
    ]);

    // Recent activities
    const recentActivity = await prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return {
      workspaceId,
      metrics: {
        totalClients,
        activeClients,
        totalWebsites,
        activeWebsites,
        totalMembers,
      },
      recentActivity,
    };
  }

  /**
   * Switch active workspace context and issue updated access token
   */
  async switchWorkspace(userId, targetWorkspaceId) {
    const membership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: targetWorkspaceId,
          userId,
        },
      },
      include: {
        workspace: true,
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
      throw new ForbiddenError('You are not an active member of this workspace');
    }

    const permissions = membership.role.permissions.map(rp => rp.permission.key);

    const accessToken = signAccessToken({
      userId,
      email: membership.userId, // will be resolved by auth
      workspaceId: membership.workspaceId,
      role: membership.role.slug,
      roleId: membership.role.id,
      permissions,
    });

    return {
      accessToken,
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
      },
      role: {
        id: membership.role.id,
        name: membership.role.name,
        slug: membership.role.slug,
      },
      permissions,
    };
  }
}

export const workspaceService = new WorkspaceService();
export default workspaceService;
