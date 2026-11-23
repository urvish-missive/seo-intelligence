// backend/src/mcp/tools/ga4.tools.js
// Group B: Google Analytics 4 Tools (summary, trends, sources, landing pages).

import { z } from 'zod';
import prisma from '../../config/database.js';
import { AnalyticsDataService } from '../../modules/analytics/analyticsData.service.js';
import { MCPUserContext } from '../auth/mcp-user-context.js';
import { getMCPRequestContext } from '../auth/mcp-context-storage.js';
import { mcpResponseService } from '../services/mcp-response.service.js';
import { MCPAuditService } from '../services/mcp-audit.service.js';

const analyticsDataService = new AnalyticsDataService();

export function registerGA4Tools(server) {
  // 4. get_ga4_summary
  server.tool(
    'get_ga4_summary',
    'Retrieve Google Analytics 4 summary KPIs: users, sessions, engagement rate, bounce rate, and conversions.',
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

        const summary = await analyticsDataService.getGA4Summary(
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
          toolName: 'get_ga4_summary',
          inputParams: args,
          outputSummary: 'GA4 summary retrieved',
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'GA4',
          period: summary.period,
          data: summary,
          dataFreshness: summary.dataFreshness,
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_ga4_summary',
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

  // 5. get_ga4_traffic_trends
  server.tool(
    'get_ga4_traffic_trends',
    'Retrieve daily GA4 traffic trends (sessions, users, engagement, pageviews) across a date window.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('End date (YYYY-MM-DD)'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const dailyRecords = await prisma.gA4DailyMetric.findMany({
          where: {
            websiteId: args.websiteId,
            date: {
              gte: new Date(`${args.startDate}T00:00:00Z`),
              lte: new Date(`${args.endDate}T23:59:59Z`),
            },
          },
          orderBy: { date: 'asc' },
          select: {
            date: true,
            sessions: true,
            users: true,
            newUsers: true,
            engagementRate: true,
            bounceRate: true,
            pageviews: true,
          },
        });

        const formatted = dailyRecords.map(r => ({
          date: r.date.toISOString().split('T')[0],
          sessions: r.sessions,
          users: r.users,
          newUsers: r.newUsers,
          engagementRate: Number(r.engagementRate),
          bounceRate: Number(r.bounceRate),
          pageviews: r.pageviews,
        }));

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_ga4_traffic_trends',
          inputParams: args,
          outputSummary: `Returned ${formatted.length} daily trend points`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'GA4',
          period: { startDate: args.startDate, endDate: args.endDate },
          data: {
            trends: formatted,
            dataPointsCount: formatted.length,
          },
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_ga4_traffic_trends',
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

  // 6. get_ga4_traffic_sources
  server.tool(
    'get_ga4_traffic_sources',
    'Retrieve traffic breakdown by acquisition source, medium, and channel grouping.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('End date (YYYY-MM-DD)'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum sources to return (default: 20)'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const sources = await analyticsDataService.getGA4TrafficSources(
          workspaceId,
          args.websiteId,
          {
            startDate: args.startDate,
            endDate: args.endDate,
            limit: args.limit || 20,
          }
        );

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_ga4_traffic_sources',
          inputParams: args,
          outputSummary: `Returned ${sources.length} traffic sources`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'GA4',
          period: { startDate: args.startDate, endDate: args.endDate },
          data: {
            sources,
            count: sources.length,
          },
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_ga4_traffic_sources',
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

  // 7. get_ga4_landing_pages
  server.tool(
    'get_ga4_landing_pages',
    'Retrieve top landing pages with sessions, engagement rates, bounce rates, and conversions.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('End date (YYYY-MM-DD)'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum landing pages to return (default: 20)'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
      search: z.string().optional().describe('URL search filter'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const result = await analyticsDataService.getGA4LandingPages(
          workspaceId,
          args.websiteId,
          {
            startDate: args.startDate,
            endDate: args.endDate,
            limit: args.limit || 20,
            offset: args.offset || 0,
            search: args.search,
          }
        );

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_ga4_landing_pages',
          inputParams: args,
          outputSummary: `Returned ${result.landingPages?.length || 0} landing pages`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'GA4',
          period: { startDate: args.startDate, endDate: args.endDate },
          data: result,
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_ga4_landing_pages',
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
