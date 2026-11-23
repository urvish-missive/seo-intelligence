// backend/tests/unit/mcp-tools.test.js
// Unit tests for MCP Response formatting, credential sanitization, and Tool registration.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mcpResponseService } from '../../src/mcp/services/mcp-response.service.js';
import { mcpContextStorage } from '../../src/mcp/auth/mcp-context-storage.js';
import { registerWebsiteTools } from '../../src/mcp/tools/website.tools.js';
import { registerGA4Tools } from '../../src/mcp/tools/ga4.tools.js';
import { registerGSCTools } from '../../src/mcp/tools/gsc.tools.js';
import { registerClarityTools } from '../../src/mcp/tools/clarity.tools.js';
import { registerSEOAnalysisTools } from '../../src/mcp/tools/seo-analysis.tools.js';
import { registerComparisonTools } from '../../src/mcp/tools/comparison.tools.js';
import { MCPUserContext } from '../../src/mcp/auth/mcp-user-context.js';
import prisma from '../../src/config/database.js';

describe('MCP Tools & Response Service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('mcpResponseService', () => {
    it('should format successful tool execution with standardized envelope', () => {
      const output = mcpResponseService.formatSuccess({
        websiteId: '00000000-0000-0000-0000-000000000001',
        provider: 'GA4',
        period: { startDate: '2026-10-01', endDate: '2026-10-31' },
        data: { activeUsers: 4500, sessions: 6200 },
        dataFreshness: { lastSyncAt: '2026-11-20T00:00:00Z', isStale: false },
      });

      expect(output.structuredContent.success).toBe(true);
      expect(output.structuredContent.provider).toBe('GA4');
      expect(output.structuredContent.websiteId).toBe('00000000-0000-0000-0000-000000000001');
      expect(output.structuredContent.data.activeUsers).toBe(4500);
      expect(output.content[0].type).toBe('text');

      const parsed = JSON.parse(output.content[0].text);
      expect(parsed.data.sessions).toBe(6200);
    });

    it('should format execution errors cleanly without leaking sensitive details', () => {
      const err = new Error('Database connection failed');
      err.code = 'DB_ERROR';
      err.status = 500;

      const output = mcpResponseService.formatError(err);
      expect(output.isError).toBe(true);

      const parsed = JSON.parse(output.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Database connection failed');
      expect(parsed.code).toBe('DB_ERROR');
      expect(parsed.stack).toBeUndefined();
    });

    it('should recursively redact secrets and auth credentials from data payloads', () => {
      const sensitiveData = {
        website: 'example.com',
        apiKey: 'sk-secret-live-1234',
        clientSecret: 'gsec-oauth-9876',
        passwordHash: '$2b$10$...',
        apiTokenEnc: 'aes-token-payload',
        metrics: {
          sessions: 1000,
          tokenHash: 'sha256-hash-val',
          sub: {
            refreshTokenEnc: 'enc-refresh',
            validCount: 42,
          },
        },
        items: [
          { name: 'Item 1', password: 'plain' },
          { name: 'Item 2', score: 99 },
        ],
      };

      const sanitized = mcpResponseService.sanitizeOutput(sensitiveData);

      expect(sanitized.website).toBe('example.com');
      expect(sanitized.apiKey).toBeUndefined();
      expect(sanitized.clientSecret).toBeUndefined();
      expect(sanitized.passwordHash).toBeUndefined();
      expect(sanitized.apiTokenEnc).toBeUndefined();
      expect(sanitized.metrics.sessions).toBe(1000);
      expect(sanitized.metrics.tokenHash).toBeUndefined();
      expect(sanitized.metrics.sub.refreshTokenEnc).toBeUndefined();
      expect(sanitized.metrics.sub.validCount).toBe(42);
      expect(sanitized.items[0].password).toBeUndefined();
      expect(sanitized.items[0].name).toBe('Item 1');
      expect(sanitized.items[1].score).toBe(99);
    });
  });

  describe('Tool Registration & Category Completeness', () => {
    function createMockServer() {
      const tools = new Map();
      return {
        tool: jest.fn((name, description, schema, handler) => {
          tools.set(name, { name, description, schema, handler });
        }),
        tools,
      };
    }

    it('should register all 3 Website tools (Group A)', () => {
      const server = createMockServer();
      registerWebsiteTools(server);

      expect(server.tools.has('list_websites')).toBe(true);
      expect(server.tools.has('get_website_overview')).toBe(true);
      expect(server.tools.has('get_website_integrations')).toBe(true);
      expect(server.tools.size).toBe(3);
    });

    it('should register all 4 GA4 tools (Group B)', () => {
      const server = createMockServer();
      registerGA4Tools(server);

      expect(server.tools.has('get_ga4_summary')).toBe(true);
      expect(server.tools.has('get_ga4_traffic_trends')).toBe(true);
      expect(server.tools.has('get_ga4_traffic_sources')).toBe(true);
      expect(server.tools.has('get_ga4_landing_pages')).toBe(true);
      expect(server.tools.size).toBe(4);
    });

    it('should register all 4 GSC tools (Group C)', () => {
      const server = createMockServer();
      registerGSCTools(server);

      expect(server.tools.has('get_gsc_summary')).toBe(true);
      expect(server.tools.has('get_gsc_keyword_performance')).toBe(true);
      expect(server.tools.has('get_gsc_page_performance')).toBe(true);
      expect(server.tools.has('get_gsc_ranking_movements')).toBe(true);
      expect(server.tools.size).toBe(4);
    });

    it('should register all 2 Clarity tools (Group D)', () => {
      const server = createMockServer();
      registerClarityTools(server);

      expect(server.tools.has('get_clarity_summary')).toBe(true);
      expect(server.tools.has('get_clarity_page_insights')).toBe(true);
      expect(server.tools.size).toBe(2);
    });

    it('should register all 5 SEO Analysis tools (Group E)', () => {
      const server = createMockServer();
      registerSEOAnalysisTools(server);

      expect(server.tools.has('get_seo_findings')).toBe(true);
      expect(server.tools.has('get_keyword_opportunities')).toBe(true);
      expect(server.tools.has('get_traffic_drop_analysis')).toBe(true);
      expect(server.tools.has('get_content_decay_analysis')).toBe(true);
      expect(server.tools.has('get_clarity_behaviour_findings')).toBe(true);
      expect(server.tools.size).toBe(5);
    });

    it('should register both Comparison tools (Group F)', () => {
      const server = createMockServer();
      registerComparisonTools(server);

      expect(server.tools.has('compare_website_periods')).toBe(true);
      expect(server.tools.has('compare_websites')).toBe(true);
      expect(server.tools.size).toBe(2);
    });
  });

  describe('Tool Execution with Authentication and Context', () => {
    const mockUser = {
      id: 'usr-analyst-1',
      role: 'admin',
      permissions: ['websites.view', 'seo.view', 'seo.analyse'],
    };
    const mockContext = {
      user: mockUser,
      workspaceId: 'ws-100',
      mcpClientId: 'mcp-test-client',
    };

    it('should execute list_websites tool within context successfully', async () => {
      const server = { tool: jest.fn() };
      registerWebsiteTools(server);

      const listTool = server.tool.mock.calls.find(c => c[0] === 'list_websites');
      const handler = listTool[3];

      jest.spyOn(prisma.website, 'findMany').mockResolvedValue([
        {
          id: 'web-1',
          name: 'Acme Store',
          domain: 'acme.com',
          client: { id: 'c-1', name: 'Acme Inc' },
          integrations: [{ integrationType: 'GA4', status: 'CONNECTED', lastSyncAt: new Date() }],
        },
      ]);
      jest.spyOn(prisma.mCPToolExecutionLog, 'create').mockResolvedValue({});

      const result = await mcpContextStorage.run(mockContext, async () => {
        return handler({ limit: 10 });
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.data.websites).toHaveLength(1);
      expect(result.structuredContent.data.websites[0].domain).toBe('acme.com');
    });

    it('should catch unauthorized access when website validation fails', async () => {
      const server = { tool: jest.fn() };
      registerGA4Tools(server);

      const ga4Tool = server.tool.mock.calls.find(c => c[0] === 'get_ga4_summary');
      const handler = ga4Tool[3];

      jest.spyOn(MCPUserContext, 'validateWebsiteAccess').mockRejectedValue(
        new Error('Access denied to target website')
      );
      jest.spyOn(prisma.mCPToolExecutionLog, 'create').mockResolvedValue({});

      const result = await mcpContextStorage.run(mockContext, async () => {
        return handler({
          websiteId: '00000000-0000-0000-0000-000000000001',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        });
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Access denied to target website');
    });
  });
});
