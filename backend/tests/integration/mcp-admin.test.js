// backend/tests/integration/mcp-admin.test.js
// Integration and controller tests for MCP Admin Management APIs.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MCPAdminController } from '../../src/mcp/controllers/mcp-admin.controller.js';
import prisma from '../../src/config/database.js';

function createMockResponse() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
  return res;
}

describe('MCP Admin Controller Integration Tests', () => {
  let controller;
  const workspaceId = 'ws-test-mcp';

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new MCPAdminController();
  });

  describe('getStatus', () => {
    it('should return server status, transport configurations, and operational metrics', async () => {
      jest.spyOn(prisma.mCPClient, 'count').mockResolvedValue(2);
      jest.spyOn(prisma.mCPAccessToken, 'count').mockResolvedValue(3);
      jest.spyOn(prisma.mCPToolExecutionLog, 'count').mockResolvedValue(150);

      const req = { params: { workspaceId } };
      const res = createMockResponse();
      let nextError = null;

      await controller.getStatus(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.data.success).toBe(true);
      expect(res.data.data.server.status).toBe('ONLINE');
      expect(res.data.data.toolsCount).toBe(20);
      expect(res.data.data.resourcesCount).toBe(3);
      expect(res.data.data.promptsCount).toBe(5);
      expect(res.data.data.metrics.activeClientsCount).toBe(2);
      expect(res.data.data.metrics.activeTokensCount).toBe(3);
      expect(res.data.data.metrics.recentLogsCount).toBe(150);
    });
  });

  describe('getCatalog', () => {
    it('should return comprehensive catalog of 20 tools, 3 resources, and 5 prompts', async () => {
      const req = { params: { workspaceId } };
      const res = createMockResponse();
      let nextError = null;

      await controller.getCatalog(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.data.success).toBe(true);
      expect(res.data.data.tools).toHaveLength(20);
      expect(res.data.data.resources).toHaveLength(3);
      expect(res.data.data.prompts).toHaveLength(5);

      const toolNames = res.data.data.tools.map(t => t.name);
      expect(toolNames).toContain('list_websites');
      expect(toolNames).toContain('get_ga4_summary');
      expect(toolNames).toContain('get_gsc_keyword_performance');
      expect(toolNames).toContain('get_clarity_summary');
      expect(toolNames).toContain('get_seo_findings');
      expect(toolNames).toContain('compare_websites');
    });
  });

  describe('listTokens', () => {
    it('should list all tokens associated with the current workspace', async () => {
      const mockTokens = [
        {
          id: 'token-1',
          createdAt: new Date(),
          lastUsedAt: null,
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: null,
          mcpClient: { id: 'mc-1', name: 'Claude Desktop', transport: 'STDIO', isActive: true },
        },
      ];

      jest.spyOn(prisma.mCPAccessToken, 'findMany').mockResolvedValue(mockTokens);

      const req = { params: { workspaceId } };
      const res = createMockResponse();
      let nextError = null;

      await controller.listTokens(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.data.success).toBe(true);
      expect(res.data.data).toHaveLength(1);
      expect(res.data.data[0].clientName).toBe('Claude Desktop');
      expect(res.data.data[0].isActive).toBe(true);
    });
  });

  describe('createToken', () => {
    it('should generate a secure mcp_live_ token, hash it for DB storage, and return raw token once', async () => {
      const mockClient = {
        id: 'client-created-1',
        workspaceId,
        name: 'Cursor IDE',
        transport: 'STREAMABLE_HTTP',
        isActive: true,
      };

      jest.spyOn(prisma.mCPClient, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.mCPClient, 'create').mockResolvedValue(mockClient);
      jest.spyOn(prisma.mCPAccessToken, 'create').mockImplementation(({ data }) => {
        expect(data.tokenHash).toBeDefined();
        expect(data.tokenHash.length).toBe(64); // SHA-256 hex length
        return Promise.resolve({
          id: 'token-created-1',
          mcpClientId: mockClient.id,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        });
      });

      const req = {
        params: { workspaceId },
        body: {
          clientName: 'Cursor IDE',
          transport: 'STREAMABLE_HTTP',
          expiresInDays: 30,
        },
      };
      const res = createMockResponse();
      let nextError = null;

      await controller.createToken(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.statusCode).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.data.rawToken).toMatch(/^mcp_live_[a-f0-9]{64}$/);
      expect(res.data.data.clientName).toBe('Cursor IDE');
      expect(res.data.data.transport).toBe('STREAMABLE_HTTP');
    });
  });

  describe('revokeToken', () => {
    it('should mark an active token as revoked', async () => {
      const mockToken = {
        id: 'token-to-revoke',
        mcpClientId: 'cl-1',
        revokedAt: null,
      };

      jest.spyOn(prisma.mCPAccessToken, 'findFirst').mockResolvedValue(mockToken);
      jest.spyOn(prisma.mCPAccessToken, 'update').mockResolvedValue({
        ...mockToken,
        revokedAt: new Date(),
      });

      const req = {
        params: { workspaceId, tokenId: 'token-to-revoke' },
      };
      const res = createMockResponse();
      let nextError = null;

      await controller.revokeToken(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.data.success).toBe(true);
      expect(res.data.message).toContain('revoked successfully');
      expect(prisma.mCPAccessToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-to-revoke' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        })
      );
    });

    it('should return 404 if token does not exist or belong to workspace', async () => {
      jest.spyOn(prisma.mCPAccessToken, 'findFirst').mockResolvedValue(null);

      const req = {
        params: { workspaceId, tokenId: 'token-nonexistent' },
      };
      const res = createMockResponse();
      let nextError = null;

      await controller.revokeToken(req, res, (err) => { nextError = err; });

      expect(nextError).toBeDefined();
      expect(nextError.statusCode).toBe(404);
      expect(nextError.message).toContain('MCP Access Token not found');
    });
  });

  describe('getLogs', () => {
    it('should return paginated tool execution audit logs', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          toolName: 'get_ga4_summary',
          success: true,
          durationMs: 45,
          executedAt: new Date(),
          mcpClient: { name: 'Claude Desktop', transport: 'STDIO' },
        },
      ];

      jest.spyOn(prisma.mCPToolExecutionLog, 'findMany').mockResolvedValue(mockLogs);
      jest.spyOn(prisma.mCPToolExecutionLog, 'count').mockResolvedValue(1);

      const req = {
        params: { workspaceId },
        query: { limit: 10, offset: 0 },
      };
      const res = createMockResponse();
      let nextError = null;

      await controller.getLogs(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.data.success).toBe(true);
      expect(res.data.data.logs).toHaveLength(1);
      expect(res.data.data.pagination.total).toBe(1);
      expect(res.data.data.logs[0].toolName).toBe('get_ga4_summary');
    });
  });
});
