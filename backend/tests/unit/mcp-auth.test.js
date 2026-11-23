// backend/tests/unit/mcp-auth.test.js
// Unit tests for MCP authentication middleware and tenant context validation.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import crypto from 'crypto';
import { mcpAuthMiddleware } from '../../src/mcp/auth/mcp-auth.middleware.js';
import { MCPUserContext } from '../../src/mcp/auth/mcp-user-context.js';
import prisma from '../../src/config/database.js';
import { signAccessToken } from '../../src/modules/auth/auth.utils.js';

describe('MCP Authentication & Tenant Security Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('mcpAuthMiddleware', () => {
    it('should reject requests without authorization credentials with 401', async () => {
      const req = { headers: {} };
      const res = {};
      let nextError = null;

      await mcpAuthMiddleware(req, res, (err) => {
        nextError = err;
      });

      expect(nextError).toBeDefined();
      expect(nextError.message).toContain('Authentication credentials required for MCP server connection.');
      expect(nextError.statusCode).toBe(401);
    });

    describe('Dedicated Revocable Tokens (mcp_live_...)', () => {
      const rawToken = 'mcp_live_' + 'a'.repeat(48);
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      it('should authenticate a valid active MCP token and populate context', async () => {
        const mockRecord = {
          id: 'token-rec-1',
          tokenHash,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 86400000), // tomorrow
          mcpClient: {
            id: 'client-1',
            name: 'Claude Desktop',
            isActive: true,
            workspaceId: 'ws-123',
            workspace: { id: 'ws-123', name: 'Missive Agency' },
          },
        };

        jest.spyOn(prisma.mCPAccessToken, 'findUnique').mockResolvedValue(mockRecord);
        jest.spyOn(prisma.mCPAccessToken, 'update').mockResolvedValue(mockRecord);

        const req = {
          headers: { authorization: `Bearer ${rawToken}` },
        };
        const res = {};
        let executedInContext = false;
        let nextError = null;

        await mcpAuthMiddleware(req, res, (err) => {
          nextError = err;
          executedInContext = true;
        });

        expect(nextError).toBeUndefined();
        expect(executedInContext).toBe(true);
        expect(req.workspaceId).toBe('ws-123');
        expect(req.mcpClient.id).toBe('client-1');
        expect(req.user.permissions).toContain('websites.view');
        expect(req.user.permissions).toContain('seo.analyse');
      });

      it('should reject a revoked MCP access token with 403', async () => {
        const mockRecord = {
          id: 'token-rec-revoked',
          tokenHash,
          revokedAt: new Date(),
          expiresAt: null,
          mcpClient: { isActive: true },
        };

        jest.spyOn(prisma.mCPAccessToken, 'findUnique').mockResolvedValue(mockRecord);

        const req = { headers: { authorization: `Bearer ${rawToken}` } };
        const res = {};
        let nextError = null;

        await mcpAuthMiddleware(req, res, (err) => {
          nextError = err;
        });

        expect(nextError).toBeDefined();
        expect(nextError.message).toContain('MCP access token has been revoked.');
        expect(nextError.statusCode).toBe(403);
      });

      it('should reject an expired MCP access token with 401', async () => {
        const mockRecord = {
          id: 'token-rec-expired',
          tokenHash,
          revokedAt: null,
          expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
          mcpClient: { isActive: true },
        };

        jest.spyOn(prisma.mCPAccessToken, 'findUnique').mockResolvedValue(mockRecord);

        const req = { headers: { authorization: `Bearer ${rawToken}` } };
        const res = {};
        let nextError = null;

        await mcpAuthMiddleware(req, res, (err) => {
          nextError = err;
        });

        expect(nextError).toBeDefined();
        expect(nextError.message).toContain('MCP access token has expired.');
        expect(nextError.statusCode).toBe(401);
      });

      it('should reject token when client profile is disabled with 403', async () => {
        const mockRecord = {
          id: 'token-rec-disabled',
          tokenHash,
          revokedAt: null,
          expiresAt: null,
          mcpClient: { isActive: false },
        };

        jest.spyOn(prisma.mCPAccessToken, 'findUnique').mockResolvedValue(mockRecord);

        const req = { headers: { authorization: `Bearer ${rawToken}` } };
        const res = {};
        let nextError = null;

        await mcpAuthMiddleware(req, res, (err) => {
          nextError = err;
        });

        expect(nextError).toBeDefined();
        expect(nextError.message).toContain('Associated MCP client profile is disabled.');
        expect(nextError.statusCode).toBe(403);
      });

      it('should reject unrecognized MCP token with 401', async () => {
        jest.spyOn(prisma.mCPAccessToken, 'findUnique').mockResolvedValue(null);

        const req = { headers: { 'x-mcp-token': rawToken } };
        const res = {};
        let nextError = null;

        await mcpAuthMiddleware(req, res, (err) => {
          nextError = err;
        });

        expect(nextError).toBeDefined();
        expect(nextError.message).toContain('Invalid MCP access token.');
        expect(nextError.statusCode).toBe(401);
      });
    });

    describe('Standard Platform JWT Bearer', () => {
      it('should authenticate valid platform JWT and resolve user workspace permissions', async () => {
        const validJwt = signAccessToken({
          userId: 'usr-1',
          email: 'admin@missive.agency',
          workspaceId: 'ws-123',
          role: 'admin',
          permissions: ['websites.view', 'seo.view'],
        });

        const req = { headers: { authorization: `Bearer ${validJwt}` } };
        const res = {};
        let nextError = null;

        await mcpAuthMiddleware(req, res, (err) => {
          nextError = err;
        });

        expect(nextError).toBeUndefined();
        expect(req.user.id).toBe('usr-1');
        expect(req.workspaceId).toBe('ws-123');
        expect(req.user.permissions).toContain('websites.view');
      });

      it('should reject invalid or malformed JWT token with 401', async () => {
        const req = { headers: { authorization: `Bearer invalid.jwt.token` } };
        const res = {};
        let nextError = null;

        await mcpAuthMiddleware(req, res, (err) => {
          nextError = err;
        });

        expect(nextError).toBeDefined();
        expect(nextError.message).toContain('Invalid authentication token.');
        expect(nextError.statusCode).toBe(401);
      });
    });
  });

  describe('MCPUserContext Tenant Isolation & RBAC', () => {
    describe('validateWebsiteAccess', () => {
      it('should require websiteId parameter', async () => {
        const user = { id: 'u1', role: 'admin' };
        await expect(
          MCPUserContext.validateWebsiteAccess(user, 'ws-1', null)
        ).rejects.toThrow('Website ID is required for this operation.');
      });

      it('should allow global admin to access any website in workspace', async () => {
        const user = { id: 'admin-1', role: 'admin' };
        const mockWebsite = { id: 'web-1', domain: 'example.com', workspaceId: 'ws-1' };

        jest.spyOn(prisma.website, 'findFirst').mockResolvedValue(mockWebsite);

        const result = await MCPUserContext.validateWebsiteAccess(user, 'ws-1', 'web-1');
        expect(result).toEqual(mockWebsite);
        expect(prisma.website.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'web-1', workspaceId: 'ws-1' },
          })
        );
      });

      it('should scope non-admin user to client membership', async () => {
        const user = { id: 'analyst-1', role: 'seo_specialist' };
        const mockWebsite = { id: 'web-1', domain: 'client.com', workspaceId: 'ws-1' };

        jest.spyOn(prisma.website, 'findFirst').mockResolvedValue(mockWebsite);

        const result = await MCPUserContext.validateWebsiteAccess(user, 'ws-1', 'web-1');
        expect(result).toEqual(mockWebsite);
        expect(prisma.website.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: 'web-1',
              workspaceId: 'ws-1',
              client: { members: { some: { userId: 'analyst-1' } } },
            },
          })
        );
      });

      it('should throw 403 Forbidden when website not found or accessible', async () => {
        const user = { id: 'analyst-1', role: 'seo_specialist' };
        jest.spyOn(prisma.website, 'findFirst').mockResolvedValue(null);

        await expect(
          MCPUserContext.validateWebsiteAccess(user, 'ws-1', 'web-unauthorized')
        ).rejects.toThrow('Access denied');
      });
    });

    describe('enforcePermission', () => {
      it('should allow super_admin bypass regardless of explicit permissions', () => {
        const user = { id: 'sadmin', role: 'super_admin', permissions: [] };
        expect(MCPUserContext.enforcePermission(user, 'custom.any')).toBe(true);
      });

      it('should allow user possessing the required permission', () => {
        const user = { id: 'u1', role: 'seo_manager', permissions: ['seo.analyse', 'websites.view'] };
        expect(MCPUserContext.enforcePermission(user, 'seo.analyse')).toBe(true);
      });

      it('should throw 403 when user lacks required permission', () => {
        const user = { id: 'u1', role: 'viewer', permissions: ['websites.view'] };
        expect(() =>
          MCPUserContext.enforcePermission(user, 'seo.analyse')
        ).toThrow('Insufficient permissions');
      });
    });
  });
});
