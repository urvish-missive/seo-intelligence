// backend/src/modules/websites/website.service.js
// Website management service — domain normalisation, CRUD, client association.

import prisma from '../../config/database.js';
import { NotFoundError, ConflictError } from '../../middleware/errorHandler.js';
import { normalizeDomain } from './website.validation.js';

export class WebsiteService {
  /**
   * List websites in a workspace (optionally filtered by clientId and status)
   */
  async listWebsites(workspaceId, user, { clientId, status, search }) {
    const isGlobalAdmin = ['super_admin', 'admin', 'SUPER_ADMIN', 'ADMIN'].includes(user.role);

    const where = {
      workspaceId,
      ...(clientId ? { clientId } : {}),
      ...(status ? { status } : {}),
      // Scoping: non-admins only see websites of clients assigned to them
      ...(!isGlobalAdmin
        ? {
            client: {
              members: {
                some: { userId: user.id },
              },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { domain: { contains: search } },
            ],
          }
        : {}),
    };

    return prisma.website.findMany({
      where,
      include: {
        client: {
          select: { id: true, name: true, slug: true },
        },
        integrations: {
          select: {
            id: true,
            integrationType: true,
            status: true,
            lastSyncAt: true,
            lastSyncStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get single website details
   */
  async getWebsiteById(workspaceId, websiteId) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            slug: true,
            companyName: true,
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        integrations: {
          select: {
            id: true,
            integrationType: true,
            status: true,
            selectedProperty: true,
            selectedPropertyName: true,
            lastSyncAt: true,
            lastSyncStatus: true,
            lastError: true,
          },
        },
      },
    });

    if (!website) throw new NotFoundError('Website');

    return website;
  }

  /**
   * Create a new website under a client
   */
  async createWebsite(workspaceId, clientId, userId, data) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, workspaceId },
    });

    if (!client) throw new NotFoundError('Client');

    const domain = normalizeDomain(data.domain);

    const existing = await prisma.website.findUnique({
      where: {
        clientId_domain: {
          clientId,
          domain,
        },
      },
    });

    if (existing) {
      throw new ConflictError(`The domain "${domain}" is already registered under this client`);
    }

    const website = await prisma.website.create({
      data: {
        clientId,
        workspaceId,
        name: data.name,
        domain,
        url: data.url || `https://${domain}`,
        description: data.description,
        timezone: data.timezone || client.timezone || 'UTC',
        status: 'ACTIVE',
        createdById: userId,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'website.created',
        entityType: 'Website',
        entityId: website.id,
        metadata: { name: website.name, domain: website.domain, clientName: client.name },
      },
    });

    return website;
  }

  /**
   * Update website details
   */
  async updateWebsite(workspaceId, websiteId, userId, data) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
    });

    if (!website) throw new NotFoundError('Website');

    const updated = await prisma.website.update({
      where: { id: websiteId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.url !== undefined ? { url: data.url } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.timezone ? { timezone: data.timezone } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'website.updated',
        entityType: 'Website',
        entityId: websiteId,
        metadata: data,
      },
    });

    return updated;
  }

  /**
   * Toggle archive website
   */
  async toggleArchiveWebsite(workspaceId, websiteId, userId) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
    });

    if (!website) throw new NotFoundError('Website');

    const isArchived = website.status === 'ARCHIVED';
    const nextStatus = isArchived ? 'ACTIVE' : 'ARCHIVED';

    const updated = await prisma.website.update({
      where: { id: websiteId },
      data: {
        status: nextStatus,
        archivedAt: isArchived ? null : new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: isArchived ? 'website.restored' : 'website.archived',
        entityType: 'Website',
        entityId: websiteId,
      },
    });

    return updated;
  }

  /**
   * Delete website
   */
  async deleteWebsite(workspaceId, websiteId, userId) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
    });

    if (!website) throw new NotFoundError('Website');

    await prisma.$transaction([
      prisma.website.delete({ where: { id: websiteId } }),
      prisma.auditLog.create({
        data: {
          workspaceId,
          userId,
          action: 'website.deleted',
          entityType: 'Website',
          entityId: websiteId,
          metadata: { domain: website.domain },
        },
      }),
    ]);

    return { message: 'Website deleted successfully' };
  }
}

export const websiteService = new WebsiteService();
export default websiteService;
