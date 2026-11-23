// backend/src/modules/members/member.service.js
// Member and Invitation management service.

import prisma from '../../config/database.js';
import {
  generateRandomToken,
  hashToken,
  hashPassword,
} from '../auth/auth.utils.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  AppError,
} from '../../middleware/errorHandler.js';

export class MemberService {
  /**
   * List members of a workspace
   */
  async listMembers(workspaceId) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });

    if (!workspace) throw new NotFoundError('Workspace');

    const members = await prisma.membership.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
            lastLoginAt: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members.map(m => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      avatar: m.user.avatar,
      userStatus: m.user.status,
      membershipStatus: m.status,
      role: m.role,
      isOwner: workspace.ownerId === m.user.id,
      joinedAt: m.joinedAt,
      invitedAt: m.invitedAt,
    }));
  }

  /**
   * Invite a new user to the workspace
   */
  async inviteMember(workspaceId, invitedById, currentUserRole, { email, roleId }) {
    // 1. Verify role exists in workspace or is system role
    const role = await prisma.role.findFirst({
      where: {
        id: roleId,
        OR: [{ workspaceId }, { workspaceId: null }],
      },
    });

    if (!role) throw new NotFoundError('Role');

    // 2. Privilege Escalation Prevention: Only Super Admin can invite someone as Super Admin
    if (role.slug === 'super_admin' && currentUserRole !== 'super_admin' && currentUserRole !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only a Super Admin can invite members with the Super Admin role');
    }

    // 3. Check if user already exists and is already a member
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMembership = await prisma.membership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: existingUser.id,
          },
        },
      });

      if (existingMembership) {
        throw new ConflictError('User is already a member of this workspace');
      }
    }

    // 4. Check for active pending invitation
    const existingInvite = await prisma.invitation.findFirst({
      where: {
        workspaceId,
        email,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      throw new ConflictError('A pending invitation for this email address already exists');
    }

    // 5. Generate secure invitation token
    const rawToken = generateRandomToken(40);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await prisma.invitation.create({
      data: {
        workspaceId,
        email,
        roleId,
        invitedById,
        tokenHash,
        expiresAt,
        status: 'PENDING',
      },
      include: {
        workspace: { select: { name: true } },
        role: { select: { name: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: invitedById,
        action: 'member.invited',
        entityType: 'Invitation',
        entityId: invitation.id,
        metadata: { email, roleName: role.name },
      },
    });

    const isDev = process.env.NODE_ENV !== 'production';
    const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invitation?token=${rawToken}`;

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      invitationLink: isDev ? invitationLink : undefined,
      devToken: isDev ? rawToken : undefined,
    };
  }

  /**
   * List pending invitations in a workspace
   */
  async listInvitations(workspaceId) {
    return prisma.invitation.findMany({
      where: {
        workspaceId,
        status: 'PENDING',
      },
      include: {
        role: { select: { id: true, name: true, slug: true } },
        invitedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Resend invitation
   */
  async resendInvitation(workspaceId, invitationId, userId) {
    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId, workspaceId, status: 'PENDING' },
    });

    if (!invitation) throw new NotFoundError('Invitation');

    const rawToken = generateRandomToken(40);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.invitation.update({
      where: { id: invitationId },
      data: {
        tokenHash,
        expiresAt,
      },
    });

    const isDev = process.env.NODE_ENV !== 'production';
    const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invitation?token=${rawToken}`;

    return {
      message: 'Invitation resent successfully',
      invitationLink: isDev ? invitationLink : undefined,
      devToken: isDev ? rawToken : undefined,
    };
  }

  /**
   * Revoke an invitation
   */
  async revokeInvitation(workspaceId, invitationId, userId) {
    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId, workspaceId },
    });

    if (!invitation) throw new NotFoundError('Invitation');

    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'REVOKED' },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'invitation.revoked',
        entityType: 'Invitation',
        entityId: invitationId,
      },
    });

    return { message: 'Invitation revoked successfully' };
  }

  /**
   * Accept an invitation
   */
  async acceptInvitation(token, { name, password }) {
    const tokenHash = hashToken(token);

    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
      include: {
        workspace: true,
        role: true,
      },
    });

    if (!invitation || invitation.status !== 'PENDING') {
      throw new AppError('Invitation is invalid or has already been used', 400);
    }

    if (invitation.expiresAt < new Date()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Invitation has expired. Please request a new invitation.', 400);
    }

    let user = await prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (!user) {
      if (!password || !name) {
        throw new AppError('Name and password are required to register an account', 400);
      }
      const passwordHash = await hashPassword(password);
      user = await prisma.user.create({
        data: {
          name,
          email: invitation.email,
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      });
    }

    // Create or reactivate membership
    await prisma.membership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invitation.workspaceId,
          userId: user.id,
        },
      },
      update: {
        roleId: invitation.roleId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
      create: {
        workspaceId: invitation.workspaceId,
        userId: user.id,
        roleId: invitation.roleId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    // Mark invitation accepted
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: invitation.workspaceId,
        userId: user.id,
        action: 'invitation.accepted',
        entityType: 'User',
        entityId: user.id,
      },
    });

    return {
      message: 'Invitation accepted successfully. You may now log in.',
      workspaceName: invitation.workspace.name,
      email: user.email,
    };
  }

  /**
   * Update member role / status
   */
  async updateMember(workspaceId, memberId, currentUserId, currentUserRole, { roleId, status }) {
    const membership = await prisma.membership.findFirst({
      where: { id: memberId, workspaceId },
      include: { workspace: true, user: true, role: true },
    });

    if (!membership) throw new NotFoundError('Member');

    // Owner protection: cannot demote or suspend workspace owner
    if (membership.workspace.ownerId === membership.userId) {
      if (status && status !== 'ACTIVE') {
        throw new ForbiddenError('Cannot change the status of the workspace owner');
      }
    }

    // Privilege escalation check
    if (roleId) {
      const targetRole = await prisma.role.findFirst({
        where: { id: roleId, OR: [{ workspaceId }, { workspaceId: null }] },
      });
      if (!targetRole) throw new NotFoundError('Target role');

      if (targetRole.slug === 'super_admin' && currentUserRole !== 'super_admin' && currentUserRole !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Only a Super Admin can promote a member to Super Admin');
      }
    }

    const updated = await prisma.membership.update({
      where: { id: memberId },
      data: {
        ...(roleId ? { roleId } : {}),
        ...(status ? { status } : {}),
      },
      include: { role: true, user: true },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: currentUserId,
        action: 'member.updated',
        entityType: 'Membership',
        entityId: memberId,
        metadata: { roleId, status, targetUser: membership.user.email },
      },
    });

    return updated;
  }

  /**
   * Remove member from workspace
   */
  async removeMember(workspaceId, memberId, currentUserId) {
    const membership = await prisma.membership.findFirst({
      where: { id: memberId, workspaceId },
      include: { workspace: true, user: true },
    });

    if (!membership) throw new NotFoundError('Member');

    // Owner protection: owner CANNOT be removed!
    if (membership.workspace.ownerId === membership.userId) {
      throw new ForbiddenError('Cannot remove the workspace owner');
    }

    await prisma.$transaction([
      prisma.membership.delete({ where: { id: memberId } }),
      // Also unassign from any client memberships in this workspace
      prisma.clientMember.deleteMany({
        where: {
          userId: membership.userId,
          client: { workspaceId },
        },
      }),
      prisma.auditLog.create({
        data: {
          workspaceId,
          userId: currentUserId,
          action: 'member.removed',
          entityType: 'Membership',
          entityId: memberId,
          metadata: { removedUser: membership.user.email },
        },
      }),
    ]);

    return { message: 'Member removed from workspace successfully' };
  }
}

export const memberService = new MemberService();
export default memberService;
