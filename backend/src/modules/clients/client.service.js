// backend/src/modules/clients/client.service.js
// Client management service — CRUD, team assignment, archiving.

import prisma from '../../config/database.js';
import { NotFoundError, ConflictError } from '../../middleware/errorHandler.js';
import { buildPagination } from '../../utils/apiResponse.js';

export class ClientService {
  /**
   * List clients with workspace scoping, assignment filtering, search, and pagination
   */
  async listClients(workspaceId, user, { search, status, page = 1, limit = 20, sortBy = 'createdAt', sortDir = 'desc' }) {
    const isGlobalAdmin = ['super_admin', 'admin', 'SUPER_ADMIN', 'ADMIN'].includes(user.role);

    const where = {
      workspaceId,
      ...(status ? { status } : {}),
      // Non-admins only see clients assigned to them
      ...(!isGlobalAdmin
        ? {
            members: {
              some: { userId: user.id },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { companyName: { contains: search } },
              { contactEmail: { contains: search } },
            ],
          }
        : {}),
    };

    const skip = (page - 1) * limit;

    const [total, clients] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortDir },
        include: {
          _count: {
            select: { websites: true, members: true },
          },
          members: {
            include: {
              user: {
                select: { id: true, name: true, email: true, avatar: true },
              },
            },
            take: 5,
          },
        },
      }),
    ]);

    const formatted = clients.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      companyName: c.companyName,
      contactName: c.contactName,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      website: c.website,
      industry: c.industry,
      status: c.status,
      websiteCount: c._count.websites,
      memberCount: c._count.members,
      assignedMembers: c.members.map(m => m.user),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return {
      clients: formatted,
      pagination: buildPagination(total, page, limit),
    };
  }

  /**
   * Get client details by ID
   */
  async getClientById(workspaceId, clientId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, workspaceId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        websites: {
          orderBy: { createdAt: 'desc' },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatar: true, status: true },
            },
            assignedBy: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!client) throw new NotFoundError('Client');

    return {
      ...client,
      websites: client.websites,
      assignedMembers: client.members.map(m => ({
        id: m.id,
        user: m.user,
        assignedBy: m.assignedBy,
        assignedAt: m.createdAt,
      })),
    };
  }

  /**
   * Create a new client
   */
  async createClient(workspaceId, userId, data) {
    const slugBase = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let slug = slugBase;
    let counter = 1;

    while (await prisma.client.findFirst({ where: { workspaceId, slug } })) {
      slug = `${slugBase}-${counter++}`;
    }

    const client = await prisma.client.create({
      data: {
        workspaceId,
        name: data.name,
        slug,
        companyName: data.companyName,
        contactName: data.contactName,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone,
        website: data.website || null,
        industry: data.industry,
        timezone: data.timezone || 'UTC',
        notes: data.notes,
        createdById: userId,
        status: 'ACTIVE',
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'client.created',
        entityType: 'Client',
        entityId: client.id,
        metadata: { name: client.name, slug: client.slug },
      },
    });

    return client;
  }

  /**
   * Update client
   */
  async updateClient(workspaceId, clientId, userId, data) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, workspaceId },
    });

    if (!client) throw new NotFoundError('Client');

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
        ...(data.contactName !== undefined ? { contactName: data.contactName } : {}),
        ...(data.contactEmail !== undefined ? { contactEmail: data.contactEmail || null } : {}),
        ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone } : {}),
        ...(data.website !== undefined ? { website: data.website || null } : {}),
        ...(data.industry !== undefined ? { industry: data.industry } : {}),
        ...(data.timezone ? { timezone: data.timezone } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'client.updated',
        entityType: 'Client',
        entityId: clientId,
        metadata: data,
      },
    });

    return updated;
  }

  /**
   * Archive / restore client
   */
  async toggleArchiveClient(workspaceId, clientId, userId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, workspaceId },
    });

    if (!client) throw new NotFoundError('Client');

    const isArchived = client.status === 'ARCHIVED';
    const nextStatus = isArchived ? 'ACTIVE' : 'ARCHIVED';

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: {
        status: nextStatus,
        archivedAt: isArchived ? null : new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: isArchived ? 'client.restored' : 'client.archived',
        entityType: 'Client',
        entityId: clientId,
      },
    });

    return updated;
  }

  /**
   * Delete client
   */
  async deleteClient(workspaceId, clientId, userId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, workspaceId },
    });

    if (!client) throw new NotFoundError('Client');

    await prisma.$transaction([
      prisma.clientMember.deleteMany({ where: { clientId } }),
      prisma.client.delete({ where: { id: clientId } }),
      prisma.auditLog.create({
        data: {
          workspaceId,
          userId,
          action: 'client.deleted',
          entityType: 'Client',
          entityId: clientId,
          metadata: { name: client.name },
        },
      }),
    ]);

    return { message: 'Client deleted successfully' };
  }

  /**
   * Assign a team member to a client
   */
  async assignMember(workspaceId, clientId, userId, assignedById) {
    const [client, user] = await Promise.all([
      prisma.client.findFirst({ where: { id: clientId, workspaceId } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);

    if (!client) throw new NotFoundError('Client');
    if (!user) throw new NotFoundError('User');

    // Verify user is a member of the workspace
    const membership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ConflictError('User is not an active member of this workspace');
    }

    const assignment = await prisma.clientMember.upsert({
      where: {
        clientId_userId: { clientId, userId },
      },
      update: { assignedById },
      create: {
        clientId,
        userId,
        assignedById,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: assignedById,
        action: 'client.member_assigned',
        entityType: 'ClientMember',
        entityId: assignment.id,
        metadata: { clientName: client.name, assignedEmail: user.email },
      },
    });

    return assignment;
  }

  /**
   * Remove a member from a client
   */
  async removeMember(workspaceId, clientId, userId, actorId) {
    const assignment = await prisma.clientMember.findFirst({
      where: { clientId, userId, client: { workspaceId } },
    });

    if (!assignment) throw new NotFoundError('Client member assignment');

    await prisma.clientMember.delete({
      where: { id: assignment.id },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: actorId,
        action: 'client.member_unassigned',
        entityType: 'ClientMember',
        entityId: assignment.id,
      },
    });

    return { message: 'Member unassigned from client successfully' };
  }
}

export const clientService = new ClientService();
export default clientService;
