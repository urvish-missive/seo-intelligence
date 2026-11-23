// backend/src/mcp/controllers/mcp-admin.controller.js
// Admin controller for MCP token provisioning, catalog inspection, and execution log monitoring.

import crypto from 'crypto';
import prisma from '../../config/database.js';
import { MCP_SERVER_CONFIG } from '../server/mcp.config.js';
import { NotFoundError, BadRequestError } from '../../middleware/errorHandler.js';

export class MCPAdminController {
  /**
   * Get MCP server status and operational overview.
   */
  async getStatus(req, res, next) {
    try {
      const { workspaceId } = req.params;

      const [activeClientsCount, activeTokensCount, recentLogsCount] = await Promise.all([
        prisma.mCPClient.count({ where: { workspaceId, isActive: true } }),
        prisma.mCPAccessToken.count({
          where: {
            mcpClient: { workspaceId },
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        }),
        prisma.mCPToolExecutionLog.count({
          where: { mcpClient: { workspaceId } },
        }),
      ]);

      res.json({
        success: true,
        data: {
          server: {
            name: MCP_SERVER_CONFIG.name,
            version: MCP_SERVER_CONFIG.version,
            status: 'ONLINE',
            transports: MCP_SERVER_CONFIG.supportedTransports,
            httpEndpoint: `/api/v1/mcp`,
            stdioCommand: `node mcp-server/src/server.js`,
          },
          metrics: {
            activeClientsCount,
            activeTokensCount,
            recentLogsCount,
          },
          toolsCount: 20,
          resourcesCount: 3,
          promptsCount: 5,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Return full catalog of tools, resources, and prompts.
   */
  async getCatalog(req, res, next) {
    try {
      const toolCatalog = [
        // Group A: Website Tools
        { name: 'list_websites', group: 'WEBSITE', description: 'List accessible websites in current workspace.' },
        { name: 'get_website_overview', group: 'WEBSITE', description: 'Cross-platform performance overview.' },
        { name: 'get_website_integrations', group: 'WEBSITE', description: 'Provider connection and sync statuses.' },
        // Group B: GA4 Tools
        { name: 'get_ga4_summary', group: 'GA4', description: 'Sessions, users, engagement, and bounce rates.' },
        { name: 'get_ga4_traffic_trends', group: 'GA4', description: 'Daily session trends over time.' },
        { name: 'get_ga4_traffic_sources', group: 'GA4', description: 'Breakdown by source, medium, and channel.' },
        { name: 'get_ga4_landing_pages', group: 'GA4', description: 'Top landing pages by organic sessions.' },
        // Group C: GSC Tools
        { name: 'get_gsc_summary', group: 'GSC', description: 'Clicks, impressions, CTR, and average position.' },
        { name: 'get_gsc_keyword_performance', group: 'GSC', description: 'Search query impressions, clicks, and rank.' },
        { name: 'get_gsc_page_performance', group: 'GSC', description: 'Search Console page performance.' },
        { name: 'get_gsc_ranking_movements', group: 'GSC', description: 'Position shifts between comparison periods.' },
        // Group D: Clarity Tools
        { name: 'get_clarity_summary', group: 'CLARITY', description: 'Rage clicks, dead clicks, and script errors.' },
        { name: 'get_clarity_page_insights', group: 'CLARITY', description: 'Page-level UX friction hotspots.' },
        // Group E: SEO Analysis Tools
        { name: 'get_seo_findings', group: 'SEO_ANALYSIS', description: 'Open deterministic findings and fixes.' },
        { name: 'get_keyword_opportunities', group: 'SEO_ANALYSIS', description: 'Striking distance queries (pos 4-20).' },
        { name: 'get_traffic_drop_analysis', group: 'SEO_ANALYSIS', description: 'Root cause analysis for organic drops.' },
        { name: 'get_content_decay_analysis', group: 'SEO_ANALYSIS', description: 'Pages experiencing sustained decay.' },
        { name: 'get_clarity_behaviour_findings', group: 'SEO_ANALYSIS', description: 'Clarity UX friction anomaly findings.' },
        // Group F: Comparison Tools
        { name: 'compare_website_periods', group: 'COMPARISON', description: 'Custom date range period comparisons.' },
        { name: 'compare_websites', group: 'COMPARISON', description: 'Side-by-side multiple website comparison.' },
      ];

      const resourceCatalog = [
        { uri: 'seo://websites', name: 'All Websites', description: 'Listing of accessible client websites.' },
        { uri: 'seo://analytics/info', name: 'Analytics Catalog', description: 'Available providers and supported metrics.' },
        { uri: 'seo://analysis/engines', name: 'SEO Engines Info', description: 'Deterministic engine metadata and severity levels.' },
      ];

      const promptCatalog = [
        { name: 'seo_website_review', description: 'Execute comprehensive SEO review.' },
        { name: 'investigate_organic_traffic_drop', description: 'Investigate organic traffic decline.' },
        { name: 'keyword_opportunity_review', description: 'Identify striking distance keyword opportunities.' },
        { name: 'landing_page_review', description: 'Review landing pages and UX friction.' },
        { name: 'monthly_seo_review', description: 'Monthly executive SEO client summary.' },
      ];

      res.json({
        success: true,
        data: {
          tools: toolCatalog,
          resources: resourceCatalog,
          prompts: promptCatalog,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * List MCP Access Tokens for workspace.
   */
  async listTokens(req, res, next) {
    try {
      const { workspaceId } = req.params;

      const tokens = await prisma.mCPAccessToken.findMany({
        where: { mcpClient: { workspaceId } },
        orderBy: { createdAt: 'desc' },
        include: {
          mcpClient: {
            select: { id: true, name: true, transport: true, isActive: true },
          },
        },
      });

      res.json({
        success: true,
        data: tokens.map(t => ({
          id: t.id,
          clientName: t.mcpClient.name,
          transport: t.mcpClient.transport,
          isActive: t.mcpClient.isActive && !t.revokedAt,
          createdAt: t.createdAt,
          lastUsedAt: t.lastUsedAt,
          expiresAt: t.expiresAt,
          revokedAt: t.revokedAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Generate a new revocable MCP Access Token.
   */
  async createToken(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const { clientName = 'Default MCP Client', transport = 'STREAMABLE_HTTP', expiresInDays = 90 } = req.body;

      // 1. Ensure or create MCPClient record
      let mcpClient = await prisma.mCPClient.findFirst({
        where: { workspaceId, name: clientName },
      });

      if (!mcpClient) {
        mcpClient = await prisma.mCPClient.create({
          data: {
            workspaceId,
            name: clientName,
            transport: transport === 'STDIO' ? 'STDIO' : 'STREAMABLE_HTTP',
            isActive: true,
          },
        });
      }

      // 2. Generate raw cryptographically secure token
      const rawSecret = `mcp_live_${crypto.randomBytes(32).toString('hex')}`;
      const tokenHash = crypto.createHash('sha256').update(rawSecret).digest('hex');

      const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null;

      const tokenRecord = await prisma.mCPAccessToken.create({
        data: {
          mcpClientId: mcpClient.id,
          tokenHash,
          expiresAt,
        },
      });

      // Return raw token ONCE to administrator
      res.status(201).json({
        success: true,
        data: {
          id: tokenRecord.id,
          rawToken: rawSecret, // NEVER SHOWN AGAIN
          clientName: mcpClient.name,
          transport: mcpClient.transport,
          expiresAt: tokenRecord.expiresAt,
          message: 'Token created. Copy this token now as it cannot be retrieved again.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Revoke an active MCP Access Token.
   */
  async revokeToken(req, res, next) {
    try {
      const { workspaceId, tokenId } = req.params;

      const token = await prisma.mCPAccessToken.findFirst({
        where: { id: tokenId, mcpClient: { workspaceId } },
      });

      if (!token) {
        throw new NotFoundError('MCP Access Token not found.');
      }

      await prisma.mCPAccessToken.update({
        where: { id: tokenId },
        data: { revokedAt: new Date() },
      });

      res.json({ success: true, message: 'MCP access token revoked successfully.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Fetch recent MCP tool execution audit logs.
   */
  async getLogs(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const [logs, total] = await Promise.all([
        prisma.mCPToolExecutionLog.findMany({
          where: { mcpClient: { workspaceId } },
          orderBy: { executedAt: 'desc' },
          take: Number(limit),
          skip: Number(offset),
          include: {
            mcpClient: { select: { name: true, transport: true } },
          },
        }),
        prisma.mCPToolExecutionLog.count({
          where: { mcpClient: { workspaceId } },
        }),
      ]);

      res.json({
        success: true,
        data: {
          logs,
          pagination: { total, limit: Number(limit), offset: Number(offset) },
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const mcpAdminController = new MCPAdminController();
