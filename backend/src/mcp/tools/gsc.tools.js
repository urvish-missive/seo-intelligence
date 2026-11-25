// backend/src/mcp/tools/gsc.tools.js
// Group C: Google Search Console Tools (summary, keyword performance, page performance, ranking movements).

import { z } from 'zod';
import prisma from '../../config/database.js';
import { AnalyticsDataService } from '../../modules/analytics/analyticsData.service.js';
import { MCPUserContext } from '../auth/mcp-user-context.js';
import { getMCPRequestContext } from '../auth/mcp-context-storage.js';
import { mcpResponseService } from '../services/mcp-response.service.js';
import { MCPAuditService } from '../services/mcp-audit.service.js';

const analyticsDataService = new AnalyticsDataService();

export function registerGSCTools(server) {
  // 8. get_gsc_summary
  server.tool(
    'get_gsc_summary',
    'Retrieve Google Search Console summary: total clicks, impressions, average CTR, and average position.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('End date (YYYY-MM-DD)'),
      compare: z.boolean().optional().describe('Whether to calculate period comparison'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const summary = await analyticsDataService.getGSCSummary(
          workspaceId,
          args.websiteId,
          {
            startDate: args.startDate,
            endDate: args.endDate,
            compare: args.compare ?? false,
          }
        );

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_gsc_summary',
          inputParams: args,
          outputSummary: 'GSC summary retrieved',
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'GSC',
          period: summary.dateRange,
          data: summary,
          dataFreshness: summary.trends.at(-1)?.date || null,
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_gsc_summary',
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

  // 9. get_gsc_keyword_performance
  server.tool(
    'get_gsc_keyword_performance',
    'Retrieve query-level Search Console metrics: query, clicks, impressions, CTR, and average position.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('End date (YYYY-MM-DD)'),
      minImpressions: z.number().int().min(0).optional().describe('Minimum impressions filter'),
      minClicks: z.number().int().min(0).optional().describe('Minimum clicks filter'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum queries to return (default: 50)'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
      search: z.string().optional().describe('Query keyword search filter'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const result = await analyticsDataService.getGSCTopQueries(
          workspaceId,
          args.websiteId,
          {
            startDate: args.startDate,
            endDate: args.endDate,
            limit: args.limit || 50,
            offset: args.offset || 0,
            search: args.search,
            minClicks: args.minClicks || 0,
            minImpressions: args.minImpressions || 0,
          }
        );

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_gsc_keyword_performance',
          inputParams: args,
          outputSummary: `Returned ${result.queries?.length || 0} queries`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'GSC',
          period: { startDate: args.startDate, endDate: args.endDate },
          data: result,
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_gsc_keyword_performance',
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

  // 10. get_gsc_page_performance
  server.tool(
    'get_gsc_page_performance',
    'Retrieve URL-level Search Console performance: page URL, clicks, impressions, CTR, and average position.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('End date (YYYY-MM-DD)'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum pages to return (default: 50)'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
      search: z.string().optional().describe('URL search filter'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const result = await analyticsDataService.getGSCTopPages(
          workspaceId,
          args.websiteId,
          {
            startDate: args.startDate,
            endDate: args.endDate,
            limit: args.limit || 50,
            offset: args.offset || 0,
            search: args.search,
          }
        );

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_gsc_page_performance',
          inputParams: args,
          outputSummary: `Returned ${result.pages?.length || 0} pages`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'GSC',
          period: { startDate: args.startDate, endDate: args.endDate },
          data: result,
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_gsc_page_performance',
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

  // 11. get_gsc_ranking_movements
  server.tool(
    'get_gsc_ranking_movements',
    'Compare query ranking positions between two periods, reporting position gains, drops, and impression deltas.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      currentStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Current period start date'),
      currentEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Current period end date'),
      compareStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Comparison period start date'),
      compareEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Comparison period end date'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum movements to return (default: 30)'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        // Fetch current and previous top queries
        const [currRes, prevRes] = await Promise.all([
          analyticsDataService.getGSCTopQueries(workspaceId, args.websiteId, {
            startDate: args.currentStartDate,
            endDate: args.currentEndDate,
            limit: 100,
          }),
          analyticsDataService.getGSCTopQueries(workspaceId, args.websiteId, {
            startDate: args.compareStartDate,
            endDate: args.compareEndDate,
            limit: 100,
          }),
        ]);

        const prevMap = new Map((prevRes.queries || []).map(q => [q.query, q]));
        const movements = [];

        for (const curr of (currRes.queries || [])) {
          const prev = prevMap.get(curr.query);
          if (prev) {
            const posChange = Number((prev.position - curr.position).toFixed(1)); // positive means improved rank
            movements.push({
              query: curr.query,
              currentPosition: curr.position,
              previousPosition: prev.position,
              positionChange: posChange,
              trend: posChange > 0 ? 'IMPROVED' : posChange < 0 ? 'DECLINED' : 'UNCHANGED',
              currentClicks: curr.clicks,
              previousClicks: prev.clicks,
              clickChange: curr.clicks - prev.clicks,
              currentImpressions: curr.impressions,
              previousImpressions: prev.impressions,
              impressionChange: curr.impressions - prev.impressions,
            });
          }
        }

        // Sort by greatest absolute position change
        movements.sort((a, b) => Math.abs(b.positionChange) - Math.abs(a.positionChange));
        const limited = movements.slice(0, args.limit || 30);

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_gsc_ranking_movements',
          inputParams: args,
          outputSummary: `Calculated movements for ${limited.length} queries`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'GSC',
          period: {
            current: { startDate: args.currentStartDate, endDate: args.currentEndDate },
            previous: { startDate: args.compareStartDate, endDate: args.compareEndDate },
          },
          data: {
            rankingMovements: limited,
            totalAnalyzed: movements.length,
          },
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_gsc_ranking_movements',
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
