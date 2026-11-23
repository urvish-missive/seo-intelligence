// backend/src/modules/auth/auth.service.js
// Authentication service — registration, login, refresh rotation, sessions, password reset.

import { v4 as uuidv4 } from 'uuid';
import prisma from '../../config/database.js';
import {
  hashPassword,
  verifyPassword,
  generateRandomToken,
  hashToken,
  signAccessToken,
} from './auth.utils.js';
import {
  AppError,
  UnauthorisedError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

export class AuthService {
  /**
   * Helper: Build unified session context for an authenticated user in a workspace
   */
  async buildUserSessionContext(userId, requestedWorkspaceId = null) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
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
        },
      },
    });

    if (!user) throw new NotFoundError('User');
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError(`Account is ${user.status.toLowerCase()}. Please contact support.`);
    }

    if (!user.memberships.length) {
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          status: user.status,
        },
        workspace: null,
        role: null,
        permissions: [],
        workspaces: [],
      };
    }

    // Determine active workspace
    let activeMembership = null;
    if (requestedWorkspaceId) {
      activeMembership = user.memberships.find(m => m.workspaceId === requestedWorkspaceId);
    }
    if (!activeMembership) {
      activeMembership = user.memberships[0];
    }

    const permissions = activeMembership.role.permissions.map(rp => rp.permission.key);

    const workspaces = user.memberships.map(m => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role.name,
      roleSlug: m.role.slug,
    }));

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        status: user.status,
      },
      workspace: {
        id: activeMembership.workspace.id,
        name: activeMembership.workspace.name,
        slug: activeMembership.workspace.slug,
      },
      role: {
        id: activeMembership.role.id,
        name: activeMembership.role.name,
        slug: activeMembership.role.slug,
      },
      permissions,
      workspaces,
    };
  }

  /**
   * Register a user.
   * If this is the very first user in the platform, they become the Super Admin
   * and create the initial workspace.
   * Otherwise, registration requires a valid invitation token.
   */
  async register({ name, email, password, workspaceName, invitationToken }, ipAddress, userAgent) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const totalUsers = await prisma.user.count();
    const isFirstUser = totalUsers === 0;

    let invitation = null;
    if (!isFirstUser) {
      if (!invitationToken) {
        throw new ForbiddenError('Public registration is closed. Please ask an admin for an invitation.');
      }

      const tokenHash = hashToken(invitationToken);
      invitation = await prisma.invitation.findUnique({
        where: { tokenHash },
        include: { workspace: true, role: true },
      });

      if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt < new Date()) {
        throw new AppError('Invitation is invalid, expired, or has already been used', 400);
      }

      if (invitation.email.toLowerCase() !== email.toLowerCase()) {
        throw new AppError('This invitation was sent to a different email address', 400);
      }
    }

    const passwordHash = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create User
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      });

      let workspaceId = null;
      let roleId = null;

      if (isFirstUser) {
        // Find or create super_admin role
        let superAdminRole = await tx.role.findFirst({
          where: { slug: 'super_admin', workspaceId: null },
        });

        if (!superAdminRole) {
          superAdminRole = await tx.role.create({
            data: {
              name: 'Super Admin',
              slug: 'super_admin',
              description: 'Full workspace administrative access',
              isSystem: true,
            },
          });
        }
        roleId = superAdminRole.id;

        // Create initial workspace
        const wsName = workspaceName || 'Missive Digital';
        const wsSlug = wsName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const workspace = await tx.workspace.create({
          data: {
            name: wsName,
            slug: wsSlug,
            ownerId: user.id,
            status: 'ACTIVE',
          },
        });
        workspaceId = workspace.id;

        // Create membership
        await tx.membership.create({
          data: {
            workspaceId: workspace.id,
            userId: user.id,
            roleId: superAdminRole.id,
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
        });
      } else if (invitation) {
        workspaceId = invitation.workspaceId;
        roleId = invitation.roleId;

        // Create membership from invitation
        await tx.membership.create({
          data: {
            workspaceId: invitation.workspaceId,
            userId: user.id,
            roleId: invitation.roleId,
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
        });

        // Mark invitation accepted
        await tx.invitation.update({
          where: { id: invitation.id },
          data: {
            status: 'ACCEPTED',
            acceptedAt: new Date(),
          },
        });
      }

      // Record audit log
      await tx.auditLog.create({
        data: {
          workspaceId,
          userId: user.id,
          action: isFirstUser ? 'workspace.created_initial' : 'user.registered_via_invitation',
          entityType: 'User',
          entityId: user.id,
          ipAddress,
          userAgent,
        },
      });

      return { user, workspaceId };
    });

    // Generate login tokens
    return this.createSession(result.user.id, result.workspaceId, ipAddress, userAgent);
  }

  /**
   * Authenticate email + password, create session, and issue tokens
   */
  async login({ email, password, workspaceId }, ipAddress, userAgent) {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorisedError('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError(`Account is ${user.status.toLowerCase()}. Please contact support.`);
    }

    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      throw new UnauthorisedError('Invalid email or password');
    }

    // Update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.createSession(user.id, workspaceId, ipAddress, userAgent);
  }

  /**
   * Create a new refresh session and issue access JWT + refresh token
   */
  async createSession(userId, targetWorkspaceId = null, ipAddress = null, userAgent = null) {
    const context = await this.buildUserSessionContext(userId, targetWorkspaceId);

    const sessionId = uuidv4();
    const rawRefreshToken = generateRandomToken(48);
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        sessionId,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    const accessToken = signAccessToken({
      userId: context.user.id,
      email: context.user.email,
      workspaceId: context.workspace?.id || null,
      role: context.role?.slug || null,
      roleId: context.role?.id || null,
      permissions: context.permissions,
      sessionId,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: context.user,
      workspace: context.workspace,
      role: context.role,
      permissions: context.permissions,
      workspaces: context.workspaces,
    };
  }

  /**
   * Refresh Token Rotation with Reuse Detection
   */
  async refreshAccessToken(rawRefreshToken, ipAddress = null, userAgent = null) {
    if (!rawRefreshToken) {
      throw new UnauthorisedError('Refresh token required');
    }

    const tokenHash = hashToken(rawRefreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorisedError('Invalid refresh token');
    }

    // Token Reuse Detection: If token is already revoked, an attacker or compromised client may be trying to replay it!
    if (storedToken.revokedAt) {
      logger.warn(`Security alert: Attempted reuse of revoked refresh token for user ${storedToken.userId}. Revoking all sessions.`);
      // Invalidate all active sessions for this user immediately
      await prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorisedError('Invalid refresh token session. Please log in again.');
    }

    // Expiry check
    if (storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorisedError('Refresh token has expired. Please log in again.');
    }

    // Rotate: Revoke the current token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    // Issue a new token in the same session
    const newRawRefreshToken = generateRandomToken(48);
    const newTokenHash = hashToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: storedToken.userId,
        tokenHash: newTokenHash,
        sessionId: storedToken.sessionId,
        expiresAt: newExpiresAt,
        ipAddress: ipAddress || storedToken.ipAddress,
        userAgent: userAgent || storedToken.userAgent,
      },
    });

    // Get current context
    const context = await this.buildUserSessionContext(storedToken.userId);

    const accessToken = signAccessToken({
      userId: context.user.id,
      email: context.user.email,
      workspaceId: context.workspace?.id || null,
      role: context.role?.slug || null,
      roleId: context.role?.id || null,
      permissions: context.permissions,
      sessionId: storedToken.sessionId,
    });

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      user: context.user,
      workspace: context.workspace,
      role: context.role,
      permissions: context.permissions,
      workspaces: context.workspaces,
    };
  }

  /**
   * Logout user by revoking the specific refresh token session
   */
  async logout(rawRefreshToken) {
    if (!rawRefreshToken) return;

    const tokenHash = hashToken(rawRefreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Get authenticated user profile with workspaces and active permissions
   */
  async getMe(userId, activeWorkspaceId = null) {
    return this.buildUserSessionContext(userId, activeWorkspaceId);
  }

  /**
   * Change password
   */
  async changePassword(userId, currentPassword, newPassword, ipAddress, userAgent) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    const isValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isValid) {
      throw new UnauthorisedError('Current password is incorrect');
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      // Invalidate all existing sessions
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId,
          action: 'user.password_changed',
          entityType: 'User',
          entityId: userId,
          ipAddress,
          userAgent,
        },
      }),
    ]);

    // Create fresh session
    return this.createSession(userId, null, ipAddress, userAgent);
  }

  /**
   * Forgot password — creates a dev-friendly reset token
   */
  async forgotPassword(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Avoid user enumeration
      return { message: 'If an account exists with this email, a reset link has been generated.' };
    }

    const resetToken = generateRandomToken(32);
    // Store in audit metadata or temporary token
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'user.password_reset_requested',
        entityType: 'User',
        entityId: user.id,
        metadata: {
          resetTokenHash: hashToken(resetToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      },
    });

    const isDev = process.env.NODE_ENV !== 'production';
    return {
      message: 'If an account exists with this email, a reset link has been generated.',
      ...(isDev ? { devResetToken: resetToken } : {}),
    };
  }

  /**
   * Reset password with token
   */
  async resetPassword(token, newPassword, ipAddress, userAgent) {
    const tokenHash = hashToken(token);

    // Look for recent reset request in audit logs
    const resetLogs = await prisma.auditLog.findMany({
      where: {
        action: 'user.password_reset_requested',
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const validLog = resetLogs.find(log => log.metadata?.resetTokenHash === tokenHash);
    if (!validLog || !validLog.userId) {
      throw new AppError('Password reset token is invalid or has expired', 400);
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: validLog.userId },
        data: { passwordHash },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: validLog.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId: validLog.userId,
          action: 'user.password_reset_completed',
          entityType: 'User',
          entityId: validLog.userId,
          ipAddress,
          userAgent,
        },
      }),
    ]);

    return { message: 'Password has been reset successfully. Please log in.' };
  }
}

export const authService = new AuthService();
export default authService;
