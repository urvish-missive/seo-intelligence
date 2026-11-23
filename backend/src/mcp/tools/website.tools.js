// backend/src/mcp/tools/website.tools.js
// Group A: Website Tools (list_websites, get_website_overview, get_website_integrations).

import { z } from 'zod';
import { WebsiteService } from '../../modules/websites/website.service.js';
import { WebsiteIntegrationService } from '../../modules/integrations/websiteIntegration.service.js';
import { AnalyticsDataService } from '../../modules/analytics/analyticsData.service.js';
import { MCPUserContext } from '../auth/mcp-user-context.js';
import { getMCPRequestContext } from '../auth/mcp-context-storage.js';
import { mcpResponseService } from '../services/mcp-response.service.js';
import { MCPAuditService } from '../services/mcp-audit.service.js';

const websiteService = new WebsiteService();
const websiteIntegrationService = new WebsiteIntegrationService();
const analyticsDataService = new AnalyticsDataService();

export function registerWebsiteTools(server) {
  // 1. list_websites
  server.tool(
    'list_websites',
    'Return websites the authenticated user is authorised to access in the current workspace.',
    {
      clientId: z.string().uuid().optional().describe('Filter websites by client ID'),
      search: z.string().optional().describe('Search query matching domain or name'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum results to return'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'websites.view');

        const websites = await websiteService.listWebsites(workspaceId, user, {
          clientId: args.clientId,
          search: args.search,
        });

        const offset = args.offset || 0;
        const limit = args.limit || 50;
        const paged = websites.slice(offset, offset + limit);

        const data = paged.map(w => ({
          websiteId: w.id,
          name: w.name,
          domain: w.domain,
          client: w.client ? { id: w.client.id, name: w.client.name } : null,
          integrations: (w.integrations || []).map(i => ({
            type: i.integrationType,
            status: i.status,
            lastSyncAt: i.lastSyncAt,
          })),
        }));

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'list_websites',
          inputParams: args,
          outputSummary: `Returned ${data.length} websites`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
        });

        return mcpResponseService.formatSuccess({
          provider: 'PLATFORM',
          data: {
            websites: data,
            total: websites.length,
            limit,
            offset,
          },
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'list_websites',
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

  // 2. get_website_overview
  server.tool(
    'get_website_overview',
    'Retrieve a cross-platform performance overview of a website (GA4, GSC, Clarity, and Sync status).',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date (YYYY-MM-DD)'),
      compare: z.boolean().optional().describe('Whether to calculate period comparison'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'websites.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const overview = await analyticsDataService.getWebsiteOverview(
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
          toolName: 'get_website_overview',
          inputParams: args,
          outputSummary: 'Website overview retrieved successfully',
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'CROSS_PLATFORM',
          period: overview.period,
          data: overview,
          dataFreshness: overview.dataFreshness,
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_website_overview',
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

  // 3. get_website_integrations
  server.tool(
    'get_website_integrations',
    'Return connection and synchronisation statuses for all providers (GA4, GSC, Clarity) without secrets.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
    },
    async (args) => {
      const startTime = Date.now();
      const { user, workspaceId, mcpClientId } = getMCPRequestContext();

      try {
        MCPUserContext.enforcePermission(user, 'integrations.view');
        await MCPUserContext.validateWebsiteAccess(user, workspaceId, args.websiteId);

        const integrations = await websiteIntegrationService.getWebsiteIntegrations(
          workspaceId,
          args.websiteId
        );

        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_website_integrations',
          inputParams: args,
          outputSummary: `Returned ${integrations.length} integration slots`,
          success: true,
          durationMs: Date.now() - startTime,
          userId: user?.id,
          websiteId: args.websiteId,
        });

        return mcpResponseService.formatSuccess({
          websiteId: args.websiteId,
          provider: 'INTEGRATIONS',
          data: {
            integrations: integrations.map(i => ({
              integrationType: i.integrationType,
              status: i.status,
              selectedProperty: i.selectedProperty,
              selectedPropertyName: i.selectedPropertyName,
              lastSyncAt: i.lastSyncAt,
              lastSyncStatus: i.lastSyncStatus,
              accountEmail: i.googleAccount?.email || null,
              clarityProjectId: i.clarityConnection?.projectId || null,
            })),
          },
        });
      } catch (err) {
        MCPAuditService.logExecution({
          mcpClientId,
          toolName: 'get_website_integrations',
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
