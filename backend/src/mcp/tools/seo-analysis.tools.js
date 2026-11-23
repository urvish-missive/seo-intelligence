// backend/src/mcp/tools/seo-analysis.tools.js
// Group E: SEO Analysis Tools (findings, keyword opportunities, traffic drops, content decay, behavioural issues).

import { z } from 'zod';
import prisma from '../../config/database.js';
import { seoFindingService } from '../../modules/seo-analysis/services/seo-finding.service.js';
import { AnalyticsDataService } from '../../modules/analytics/analyticsData.service.js';
import { MCPUserContext } from '../auth/mcp-user-context.js';
import { getMCPRequestContext } from '../auth/mcp-context-storage.js';
import { mcpResponseService } from '../services/mcp-response.service.js';
import { MCPAuditService } from '../services/mcp-audit.service.js';

const analyticsDataService = new AnalyticsDataService();

export function registerSEOAnalysisTools(server) {
  // 14. get_seo_findings
  server.tool(
    'get_seo_findings',
    'Retrieve deterministic SEO findings: title, severity, priority, affected URL/query, evidence, and recommendations.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'IGNORED']).optional().describe('Finding status filter'),
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional().describe('Severity filter'),
      priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional().describe('Priority filter'),
      type: z.string().optional().describe('Finding type (e.g. TRAFFIC_DROP, STRIKING_DISTANCE, CTR_DEFICIT)'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum findings to return (default: 50)'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const result = await seoFindingService.getFindings(workspaceId, args.websiteId, {
          status: args.status,
          severity: args.severity,
          priority: args.priority,
          type: args.type,
          limit: args.limit || 50,
          offset: args.offset || 0,
        });

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_seo_findings',
          inputParams: args,
          outputSummary: `Returned ${result.findings?.length || 0} findings`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'SEO_ENGINE',
          data: result,
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_seo_findings',
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

  // 15. get_keyword_opportunities
  server.tool(
    'get_keyword_opportunities',
    'Retrieve high-potential striking distance queries (positions 4-20) with high impressions and CTR deficits.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      minImpressions: z.number().int().min(0).optional().describe('Minimum impressions filter (default: 50)'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum opportunities to return (default: 30)'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const minImp = args.minImpressions || 50;
        const limit = args.limit || 30;

        const queries = await prisma.gSCQueryMetric.findMany({
          where: {
            websiteId: args.websiteId,
            position: { gte: 4.0, lte: 20.0 },
            impressions: { gte: minImp },
          },
          orderBy: { impressions: 'desc' },
          take: limit,
          select: {
            query: true,
            clicks: true,
            impressions: true,
            ctr: true,
            position: true,
            date: true,
          },
        });

        const formatted = queries.map(q => ({
          query: q.query,
          impressions: q.impressions,
          clicks: q.clicks,
          ctr: Number(q.ctr),
          position: Number(q.position),
          opportunityCategory: q.position <= 10 ? 'PAGE_1_STRIKING_DISTANCE' : 'PAGE_2_STRIKING_DISTANCE',
          priority: q.impressions > 500 ? 'HIGH' : 'MEDIUM',
          recommendation: `Optimise page title, meta description, and primary content headers for "${q.query}".`,
        }));

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_keyword_opportunities',
          inputParams: args,
          outputSummary: `Returned ${formatted.length} keyword opportunities`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'SEO_ENGINE',
          data: {
            opportunities: formatted,
            count: formatted.length,
          },
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_keyword_opportunities',
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

  // 16. get_traffic_drop_analysis
  server.tool(
    'get_traffic_drop_analysis',
    'Investigate organic traffic changes between two periods across GA4 and GSC, identifying declining pages and queries.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Current period start date'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Current period end date'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.analyse');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        // Fetch cross-platform comparison
        const overview = await analyticsDataService.getWebsiteOverview(workspaceId, args.websiteId, {
          startDate: args.startDate,
          endDate: args.endDate,
          compare: true,
        });

        // Fetch open traffic drop findings
        const findings = await seoFindingService.getFindings(workspaceId, args.websiteId, {
          type: 'TRAFFIC_DROP',
          status: 'OPEN',
          limit: 10,
        });

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_traffic_drop_analysis',
          inputParams: args,
          outputSummary: 'Traffic drop analysis completed',
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'SEO_ENGINE',
          period: overview.period,
          data: {
            ga4Overview: overview.ga4Overview,
            gscOverview: overview.gscOverview,
            trafficDropFindings: findings.findings || [],
          },
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_traffic_drop_analysis',
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

  // 17. get_content_decay_analysis
  server.tool(
    'get_content_decay_analysis',
    'Identify landing pages experiencing sustained historical traffic decay over 2 or 3 rolling comparison windows.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum decaying pages to return (default: 20)'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.analyse');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const findings = await seoFindingService.getFindings(workspaceId, args.websiteId, {
          type: 'CONTENT_DECAY',
          limit: args.limit || 20,
        });

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_content_decay_analysis',
          inputParams: args,
          outputSummary: `Returned ${findings.findings?.length || 0} decay findings`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'SEO_ENGINE',
          data: {
            decayFindings: findings.findings || [],
            count: findings.findings?.length || 0,
          },
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_content_decay_analysis',
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

  // 18. get_clarity_behaviour_findings
  server.tool(
    'get_clarity_behaviour_findings',
    'Retrieve behavioural friction findings detected by Clarity: dead clicks, rage clicks, and usability barriers.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional().describe('Severity filter'),
      page: z.string().optional().describe('URL search filter'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'seo.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const findings = await seoFindingService.getFindings(workspaceId, args.websiteId, {
          type: 'BEHAVIOUR_FRICTION',
          severity: args.severity,
          search: args.page,
          limit: 30,
        });

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_clarity_behaviour_findings',
          inputParams: args,
          outputSummary: `Returned ${findings.findings?.length || 0} behaviour findings`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'SEO_ENGINE',
          data: {
            behaviourFindings: findings.findings || [],
            count: findings.findings?.length || 0,
          },
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_clarity_behaviour_findings',
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
