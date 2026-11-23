// backend/src/modules/integrations/google/googleAuth.service.js
// Service for Google OAuth2 connection lifecycle, token persistence, and workspace scoping.

import { google } from 'googleapis';
import prisma from '../../../config/database.js';
import GoogleClientFactory from './googleClient.factory.js';
import { generateOAuthState, verifyOAuthState, encrypt } from '../../../utils/encryption.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
];

export class GoogleAuthService {
  /**
   * Generate a Google OAuth2 authorization URL with cryptographic HMAC state.
   */
  async generateAuthorizationUrl(workspaceId, user) {
    // Verify workspace exists and user is active member
    const membership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: user.id,
        },
      },
    });

    const isGlobalSuperAdmin = user.role === 'super_admin' || user.role === 'SUPER_ADMIN';
    if (!membership && !isGlobalSuperAdmin) {
      throw new ForbiddenError('You do not have access to this workspace');
    }

    const oauth2Client = GoogleClientFactory.createOAuth2Client();

    // Generate signed HMAC state parameter containing workspaceId and userId
    const state = generateOAuthState({
      workspaceId,
      userId: user.id,
    });

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      state,
    });

    return { authUrl, state };
  }

  /**
   * Handle the OAuth callback from Google.
   * Exchanges code for tokens, retrieves user profile, encrypts tokens, and stores account.
   */
  async handleCallback(code, state) {
    if (!code) {
      throw new BadRequestError('Missing authorization code from Google.');
    }

    // 1. Validate cryptographic state
    const statePayload = verifyOAuthState(state);
    const { workspaceId, userId } = statePayload;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundError('Target workspace not found.');
    }

    // 2. Exchange authorization code for tokens
    const oauth2Client = GoogleClientFactory.createOAuth2Client();
    let tokens;
    try {
      const response = await oauth2Client.getToken(code);
      tokens = response.tokens;
    } catch (tokenErr) {
      logger.error(`Google token exchange error: ${tokenErr.message}`);
      throw new BadRequestError(`Failed to exchange authorization code: ${tokenErr.message}`);
    }

    if (!tokens.access_token) {
      throw new BadRequestError('Google did not return an access token.');
    }

    // 3. Fetch Google User Profile info (email, sub ID, name, avatar)
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    let userInfo;
    try {
      const infoRes = await oauth2.userinfo.get();
      userInfo = infoRes.data;
    } catch (infoErr) {
      logger.error(`Failed to fetch Google userinfo: ${infoErr.message}`);
      throw new BadRequestError('Failed to fetch user profile information from Google.');
    }

    // 4. Encrypt credentials at rest
    const accessTokenEnc = encrypt(tokens.access_token);
    const refreshTokenEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

    // If Google didn't return a refresh_token on re-consent, preserve existing refresh token
    const existingAccount = await prisma.googleAccount.findUnique({
      where: {
        workspaceId_email: {
          workspaceId,
          email: userInfo.email,
        },
      },
    });

    const finalRefreshTokenEnc = refreshTokenEnc || existingAccount?.refreshTokenEnc;
    if (!finalRefreshTokenEnc) {
      throw new BadRequestError(
        'Google did not provide a refresh token. Please re-authorize and ensure consent is granted.'
      );
    }

    const tokenExpiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    const grantedScopes = Array.isArray(tokens.scope)
      ? tokens.scope.join(' ')
      : typeof tokens.scope === 'string'
      ? tokens.scope
      : GOOGLE_SCOPES.join(' ');

    // 5. Upsert GoogleAccount record in workspace
    const googleAccount = await prisma.googleAccount.upsert({
      where: {
        workspaceId_email: {
          workspaceId,
          email: userInfo.email,
        },
      },
      update: {
        googleId: userInfo.id,
        displayName: userInfo.name || null,
        avatarUrl: userInfo.picture || null,
        accessTokenEnc,
        refreshTokenEnc: finalRefreshTokenEnc,
        tokenExpiresAt,
        scopes: grantedScopes,
        status: 'CONNECTED',
        lastRefreshedAt: new Date(),
      },
      create: {
        workspaceId,
        googleId: userInfo.id,
        email: userInfo.email,
        displayName: userInfo.name || null,
        avatarUrl: userInfo.picture || null,
        accessTokenEnc,
        refreshTokenEnc: finalRefreshTokenEnc,
        tokenExpiresAt,
        scopes: grantedScopes,
        status: 'CONNECTED',
      },
    });

    // 6. Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'integration.google_connected',
        entityType: 'GoogleAccount',
        entityId: googleAccount.id,
        metadata: {
          email: googleAccount.email,
          googleId: googleAccount.googleId,
        },
      },
    });

    logger.info(`Google account ${googleAccount.email} connected to workspace ${workspaceId} by user ${userId}`);

    return {
      googleAccount: {
        id: googleAccount.id,
        email: googleAccount.email,
        displayName: googleAccount.displayName,
        avatarUrl: googleAccount.avatarUrl,
        status: googleAccount.status,
      },
      workspaceId,
    };
  }

  /**
   * List all connected Google accounts in a workspace (safe metadata only).
   */
  async listAccounts(workspaceId) {
    const accounts = await prisma.googleAccount.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        tokenExpiresAt: true,
        lastRefreshedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { integrations: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return accounts.map(acc => ({
      ...acc,
      connectedIntegrationsCount: acc._count.integrations,
      _count: undefined,
    }));
  }

  /**
   * Disconnect a Google account from a workspace.
   */
  async disconnectAccount(workspaceId, accountId, user) {
    const account = await prisma.googleAccount.findFirst({
      where: { id: accountId, workspaceId },
      include: {
        integrations: true,
      },
    });

    if (!account) {
      throw new NotFoundError('Google account not found in this workspace.');
    }

    // Set linked integrations to NOT_CONNECTED
    if (account.integrations.length > 0) {
      await prisma.integrationConnection.updateMany({
        where: { googleAccountId: account.id },
        data: {
          googleAccountId: null,
          status: 'NOT_CONNECTED',
          lastError: 'Google account was disconnected from workspace.',
        },
      });
    }

    // Try revoking token at Google (best effort)
    try {
      const oauth2Client = GoogleClientFactory.createOAuth2Client();
      const accessToken = account.accessTokenEnc ? decrypt(account.accessTokenEnc) : null;
      if (accessToken) {
        await oauth2Client.revokeToken(accessToken);
      }
    } catch (revokeErr) {
      logger.warn(`Could not revoke token with Google servers: ${revokeErr.message}`);
    }

    // Delete or mark status as REVOKED
    await prisma.googleAccount.delete({
      where: { id: account.id },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'integration.google_disconnected',
        entityType: 'GoogleAccount',
        entityId: account.id,
        metadata: { email: account.email },
      },
    });

    logger.info(`Google account ${account.email} disconnected from workspace ${workspaceId}`);
    return { success: true, message: `Google account ${account.email} disconnected successfully.` };
  }
}

export const googleAuthService = new GoogleAuthService();
export default googleAuthService;
