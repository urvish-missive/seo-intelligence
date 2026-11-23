// backend/src/mcp/auth/mcp-auth.middleware.js
// Dual authentication middleware for remote MCP clients (JWT Bearer & Revocable MCPAccessToken).

import crypto from 'crypto';
import prisma from '../../config/database.js';
import { verifyAccessToken } from '../../modules/auth/auth.utils.js';
import { UnauthorisedError, ForbiddenError } from '../../middleware/errorHandler.js';
import { mcpContextStorage } from './mcp-context-storage.js';

export async function mcpAuthMiddleware(req, res, next) {
  try {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.headers['x-mcp-token']) {
      token = req.headers['x-mcp-token'];
    }

    if (!token) {
      throw new UnauthorisedError('Authentication credentials required for MCP server connection.');
    }

    // 1. Check for dedicated revocable MCP token (e.g. "mcp_live_...")
    const isDedicatedMcpToken = token.startsWith('mcp_') || (!token.includes('.') && token.length >= 32);
    if (isDedicatedMcpToken) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const accessTokenRecord = await prisma.mCPAccessToken.findUnique({
        where: { tokenHash },
        include: {
          mcpClient: {
            include: { workspace: true },
          },
        },
      });

      if (!accessTokenRecord) {
        throw new UnauthorisedError('Invalid MCP access token.');
      }

      if (accessTokenRecord.revokedAt) {
        throw new ForbiddenError('MCP access token has been revoked.');
      }

      if (accessTokenRecord.expiresAt && accessTokenRecord.expiresAt < new Date()) {
        throw new UnauthorisedError('MCP access token has expired.');
      }

      if (!accessTokenRecord.mcpClient?.isActive) {
        throw new ForbiddenError('Associated MCP client profile is disabled.');
      }

      // Update lastUsedAt asynchronously
      prisma.mCPAccessToken.update({
        where: { id: accessTokenRecord.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {});

      // Establish authenticated security context
      req.mcpClient = accessTokenRecord.mcpClient;
      req.workspaceId = accessTokenRecord.mcpClient.workspaceId;
      req.user = {
        id: accessTokenRecord.mcpClient.id,
        email: `mcp-${accessTokenRecord.mcpClient.name}@platform.local`,
        role: 'seo_manager',
        workspaceId: accessTokenRecord.mcpClient.workspaceId,
        permissions: [
          'workspace.view',
          'websites.view',
          'integrations.view',
          'seo.view',
          'seo.analyse',
          'ai.chat',
          'ai.analyse',
        ],
      };

      return mcpContextStorage.run(
        { user: req.user, workspaceId: req.workspaceId, mcpClient: req.mcpClient },
        () => next()
      );
    }

    // 2. Otherwise validate standard platform user JWT
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorisedError('Access token has expired.');
      }
      throw new UnauthorisedError('Invalid authentication token.');
    }

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      workspaceId: decoded.workspaceId || null,
      role: decoded.role || null,
      permissions: decoded.permissions || [],
    };
    req.workspaceId = decoded.workspaceId;

    if (!req.workspaceId) {
      throw new ForbiddenError('No active workspace associated with authentication token.');
    }

    mcpContextStorage.run(
      { user: req.user, workspaceId: req.workspaceId, mcpClient: req.mcpClient || null },
      () => next()
    );
  } catch (err) {
    next(err);
  }
}
