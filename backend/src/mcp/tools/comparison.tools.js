// backend/src/mcp/tools/comparison.tools.js
// Group F: Comparison Tools (compare_website_periods, compare_websites).

import { z } from 'zod';
import { AnalyticsDataService } from '../../modules/analytics/analyticsData.service.js';
import { calculateComparisonMetric } from '../../utils/analyticsDate.utils.js';
import { MCPUserContext } from '../auth/mcp-user-context.js';
import { getMCPRequestContext } from '../auth/mcp-context-storage.js';
import { mcpResponseService } from '../services/mcp-response.service.js';
import { MCPAuditService } from '../services/mcp-audit.service.js';
import { BadRequestError } from '../../middleware/errorHandler.js';

const analyticsDataService = new AnalyticsDataService();

export function registerComparisonTools(server) {
  // 19. compare_website_periods
  server.tool(
    'compare_website_periods',
    'Compare performance metrics of a website between two custom date ranges, reporting absolute and percentage deltas.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      currentStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Current period start date'),
      currentEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Current period end date'),
      compareStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Comparison period start date'),
      compareEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Comparison period end date'),
      provider: z.enum(['GA4', 'GSC', 'ALL']).optional().describe('Provider to compare (default: ALL)'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.analyse');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const targetProvider = args.provider || 'ALL';
        const result = {};

        if (targetProvider === 'GA4' || targetProvider === 'ALL') {
          const [currGA4, prevGA4] = await Promise.all([
            analyticsDataService.getGA4Summary(workspaceId, args.websiteId, {
              startDate: args.currentStartDate,
              endDate: args.currentEndDate,
              compare: false,
            }).catch(() => null),
            analyticsDataService.getGA4Summary(workspaceId, args.websiteId, {
              startDate: args.compareStartDate,
              endDate: args.compareEndDate,
              compare: false,
            }).catch(() => null),
          ]);

          if (currGA4?.current && prevGA4?.current) {
            result.ga4 = {
              sessions: calculateComparisonMetric(currGA4.current.sessions, prevGA4.current.sessions),
              users: calculateComparisonMetric(currGA4.current.users, prevGA4.current.users),
              engagementRate: calculateComparisonMetric(currGA4.current.engagementRate, prevGA4.current.engagementRate),
              bounceRate: calculateComparisonMetric(currGA4.current.bounceRate, prevGA4.current.bounceRate),
            };
          }
        }

        if (targetProvider === 'GSC' || targetProvider === 'ALL') {
          const [currGSC, prevGSC] = await Promise.all([
            analyticsDataService.getGSCSummary(workspaceId, args.websiteId, {
              startDate: args.currentStartDate,
              endDate: args.currentEndDate,
              compare: false,
            }).catch(() => null),
            analyticsDataService.getGSCSummary(workspaceId, args.websiteId, {
              startDate: args.compareStartDate,
              endDate: args.compareEndDate,
              compare: false,
            }).catch(() => null),
          ]);

          if (currGSC?.current && prevGSC?.current) {
            result.gsc = {
              clicks: calculateComparisonMetric(currGSC.current.clicks, prevGSC.current.clicks),
              impressions: calculateComparisonMetric(currGSC.current.impressions, prevGSC.current.impressions),
              ctr: calculateComparisonMetric(currGSC.current.ctr, prevGSC.current.ctr),
              position: calculateComparisonMetric(currGSC.current.position, prevGSC.current.position),
            };
          }
        }

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'compare_website_periods',
          inputParams: args,
          outputSummary: 'Period comparison generated',
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: targetProvider,
          period: {
            current: { startDate: args.currentStartDate, endDate: args.currentEndDate },
            previous: { startDate: args.compareStartDate, endDate: args.compareEndDate },
          },
          data: result,
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'compare_website_periods',
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

  // 20. compare_websites
  server.tool(
    'compare_websites',
    'Compare performance across multiple websites (2 to 10) for the same reporting window. Caller must have access to all websites.',
    {
      websiteIds: z.array(z.string().uuid()).min(2).max(10).describe('List of website IDs to compare (2 to 10)'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('End date (YYYY-MM-DD)'),
      provider: z.enum(['GA4', 'GSC', 'ALL']).optional().describe('Provider to compare (default: ALL)'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.analyse');

        // Strictly validate caller has access to EVERY website
        const validatedWebsites = await Promise.all(
          args.websiteIds.map(wId => MCPUserContext.validateWebsiteAccess(user, workspaceId, wId))
        );

        const targetProvider = args.provider || 'ALL';

        const comparisons = await Promise.all(
          validatedWebsites.map(async (site) => {
            const entry = {
              websiteId: site.id,
              domain: site.domain,
              client: site.client?.name || 'N/A',
            };

            if (targetProvider === 'GA4' || targetProvider === 'ALL') {
              const ga4 = await analyticsDataService.getGA4Summary(workspaceId, site.id, {
                startDate: args.startDate,
                endDate: args.endDate,
                compare: false,
              }).catch(() => null);
              entry.ga4 = ga4?.current || null;
            }

            if (targetProvider === 'GSC' || targetProvider === 'ALL') {
              const gsc = await analyticsDataService.getGSCSummary(workspaceId, site.id, {
                startDate: args.startDate,
                endDate: args.endDate,
                compare: false,
              }).catch(() => null);
              entry.gsc = gsc?.current || null;
            }

            return entry;
          })
        );

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'compare_websites',
          inputParams: args,
          outputSummary: `Compared ${comparisons.length} websites`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
        });

        return mcpResponseService.formatSuccess({
          provider: targetProvider,
          period: { startDate: args.startDate, endDate: args.endDate },
          data: {
            comparedWebsites: comparisons,
            count: comparisons.length,
          },
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'compare_websites',
          inputParams: args,
          success: false,
          errorMessage: err.message,
          durationMs: Date.now() - startTime,
          userId: user?.id,
        });
        return mcpResponseService.formatError(err);
      }
    }
  );
}
