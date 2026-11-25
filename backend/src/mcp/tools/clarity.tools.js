// backend/src/mcp/tools/clarity.tools.js
// Group D: Microsoft Clarity Behavioral Tools (summary, page insights).

import { z } from 'zod';
import prisma from '../../config/database.js';
import { AnalyticsDataService } from '../../modules/analytics/analyticsData.service.js';
import { MCPUserContext } from '../auth/mcp-user-context.js';
import { getMCPRequestContext } from '../auth/mcp-context-storage.js';
import { mcpResponseService } from '../services/mcp-response.service.js';
import { MCPAuditService } from '../services/mcp-audit.service.js';

const analyticsDataService = new AnalyticsDataService();

export function registerClarityTools(server) {
  // 12. get_clarity_summary
  server.tool(
    'get_clarity_summary',
    'Retrieve stored Microsoft Clarity behavioural analytics: dead clicks, rage clicks, quick backs, and script errors.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const summary = await analyticsDataService.getClaritySummary(
          workspaceId,
          args.websiteId
        );

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_clarity_summary',
          inputParams: args,
          outputSummary: 'Clarity summary retrieved',
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'CLARITY',
          data: summary,
          dataFreshness: summary.dataFreshness,
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_clarity_summary',
          inputParams: args,
          success: false,
          errorMessage: err.message,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });
        return mcpResponseService.formatError(err);
      }
    }
  );

  // 13. get_clarity_page_insights
  server.tool(
    'get_clarity_page_insights',
    'Retrieve page-level UX friction hotspots: dead clicks, rage clicks, excessive scrolls, and script errors.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      page: z.string().optional().describe('URL search filter for specific page'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum pages to return (default: 30)'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const where = {
          websiteId: args.websiteId,
          ...(args.page ? { page: { contains: args.page } } : {}),
        };

        const pages = await prisma.clarityPageMetric.findMany({
          where,
          orderBy: [{ deadClicks: 'desc' }, { rageClicks: 'desc' }],
          take: args.limit || 30,
          select: {
            page: true,
            sessions: true,
            deadClicks: true,
            rageClicks: true,
            quickBacks: true,
            date: true,
          },
        });

        const formatted = pages.map(p => ({
          page: p.page,
          sessions: p.sessions,
          deadClicks: p.deadClicks,
          rageClicks: p.rageClicks,
          quickBacks: p.quickBacks,
          date: p.date ? String(p.date).slice(0, 10) : null,
        }));

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_clarity_page_insights',
          inputParams: args,
          outputSummary: `Returned ${formatted.length} friction pages`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'CLARITY',
          data: {
            frictionPages: formatted,
            count: formatted.length,
          },
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_clarity_page_insights',
          inputParams: args,
          success: false,
          errorMessage: err.message,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });
        return mcpResponseService.formatError(err);
      }
    }
  );
}
