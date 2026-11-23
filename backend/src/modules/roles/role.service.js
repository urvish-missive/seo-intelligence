// backend/src/modules/roles/role.service.js
import prisma from '../../config/database.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../middleware/errorHandler.js';

export class RoleService {
  async listRoles(workspaceId) {
    return prisma.role.findMany({
      where: {
        OR: [{ workspaceId }, { workspaceId: null }],
      },
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: {
          select: { memberships: true },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async listPermissions() {
    return prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { key: 'asc' }],
    });
  }

  async createRole(workspaceId, { name, description, permissionKeys = [] }) {
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const existing = await prisma.role.findFirst({
      where: { workspaceId, slug: slugBase },
    });
    if (existing) {
      throw new ConflictError('A role with this name already exists in this workspace');
    }

    // Resolve permissions
    const permissions = await prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
    });

    return prisma.role.create({
      data: {
        workspaceId,
        name,
        slug: slugBase,
        description,
        isSystem: false,
        permissions: {
          create: permissions.map(p => ({
            permissionId: p.id,
          })),
        },
      },
      include: {
        permissions: { include: { permission: true } },
      },
    });
  }

  async updateRole(workspaceId, roleId, { name, description, permissionKeys }) {
    const role = await prisma.role.findFirst({
      where: { id: roleId, workspaceId },
    });

    if (!role) throw new NotFoundError('Role');
    if (role.isSystem) {
      throw new ForbiddenError('System roles cannot be modified');
    }

    if (permissionKeys) {
      const permissions = await prisma.permission.findMany({
        where: { key: { in: permissionKeys } },
      });

      // Reset permissions
      await prisma.rolePermission.deleteMany({ where: { roleId } });
      await prisma.rolePermission.createMany({
        data: permissions.map(p => ({ roleId, permissionId: p.id })),
      });
    }

    return prisma.role.update({
      where: { id: roleId },
      data: {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
      include: {
        permissions: { include: { permission: true } },
      },
    });
  }

  async deleteRole(workspaceId, roleId) {
    const role = await prisma.role.findFirst({
      where: { id: roleId, workspaceId },
      include: { _count: { select: { memberships: true } } },
    });

    if (!role) throw new NotFoundError('Role');
    if (role.isSystem) {
      throw new ForbiddenError('System roles cannot be deleted');
    }

    if (role._count.memberships > 0) {
      throw new ForbiddenError(`Cannot delete role: Assigned to ${role._count.memberships} active member(s). Reassign them first.`);
    }

    await prisma.role.delete({ where: { id: roleId } });
    return { message: 'Role deleted successfully' };
  }
}

export const roleService = new RoleService();
export default roleService;
