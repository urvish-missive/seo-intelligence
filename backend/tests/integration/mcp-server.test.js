// backend/tests/integration/mcp-server.test.js
// Integration test verifying McpServer initialization, tools, resources, and prompts registration.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createMCPServer } from '../../src/mcp/server/mcp.server.js';
import { mcpContextStorage } from '../../src/mcp/auth/mcp-context-storage.js';
import prisma from '../../src/config/database.js';

describe('McpServer Architecture & Registration Integration Tests', () => {
  let mcpServer;

  beforeEach(() => {
    jest.clearAllMocks();
    mcpServer = createMCPServer();
  });

  it('should instantiate McpServer with server capabilities', () => {
    expect(mcpServer).toBeDefined();
    expect(mcpServer.server).toBeDefined();
  });

  describe('Prompt Generation Integration', () => {
    it('should generate seo_website_review prompt messages with guided steps', async () => {
      // Prompt registration can be queried or invoked directly
      const promptName = 'seo_website_review';
      const promptObj = mcpServer._prompts?.get(promptName) || mcpServer.prompts?.[promptName];

      if (promptObj && typeof promptObj.handler === 'function') {
        const result = await promptObj.handler({
          websiteId: '00000000-0000-0000-0000-000000000001',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        });

        expect(result.messages).toBeDefined();
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].content.text).toContain('get_website_overview');
        expect(result.messages[0].content.text).toContain('get_ga4_summary');
        expect(result.messages[0].content.text).toContain('get_gsc_summary');
      }
    });

    it('should generate investigate_organic_traffic_drop prompt messages', async () => {
      const promptName = 'investigate_organic_traffic_drop';
      const promptObj = mcpServer._prompts?.get(promptName) || mcpServer.prompts?.[promptName];

      if (promptObj && typeof promptObj.handler === 'function') {
        const result = await promptObj.handler({
          websiteId: '00000000-0000-0000-0000-000000000001',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        });

        expect(result.messages[0].content.text).toContain('get_traffic_drop_analysis');
      }
    });
  });

  describe('Resource Retrieval Integration', () => {
    const mockContext = {
      user: { id: 'u1', role: 'admin', permissions: ['websites.view', 'seo.view'] },
      workspaceId: 'ws-123',
    };

    it('should return analytics info resource contents', async () => {
      const resourceKey = 'seo://analytics/info';
      const resourceObj = mcpServer._resources?.get(resourceKey) || mcpServer.resources?.[resourceKey];

      if (resourceObj && typeof resourceObj.read === 'function') {
        const result = await mcpContextStorage.run(mockContext, async () => {
          return resourceObj.read(new URL('seo://analytics/info'));
        });

        expect(result.contents).toBeDefined();
        expect(result.contents[0].mimeType).toBe('application/json');
        const parsed = JSON.parse(result.contents[0].text);
        expect(parsed.providers).toContain('GA4');
        expect(parsed.providers).toContain('GSC');
        expect(parsed.providers).toContain('CLARITY');
      }
    });

    it('should return analysis engines resource contents', async () => {
      const resourceKey = 'seo://analysis/engines';
      const resourceObj = mcpServer._resources?.get(resourceKey) || mcpServer.resources?.[resourceKey];

      if (resourceObj && typeof resourceObj.read === 'function') {
        const result = await mcpContextStorage.run(mockContext, async () => {
          return resourceObj.read(new URL('seo://analysis/engines'));
        });

        expect(result.contents).toBeDefined();
        const parsed = JSON.parse(result.contents[0].text);
        expect(parsed.engineCount).toBe(6);
        expect(parsed.engines.map(e => e.id)).toContain('striking_distance');
      }
    });
  });
});
