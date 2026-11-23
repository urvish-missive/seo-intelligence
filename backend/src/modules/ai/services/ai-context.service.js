// backend/src/modules/ai/services/ai-context.service.js
// Context retrieval service: collects website data, GA4, GSC, Clarity metrics,
// and Phase 7 SEO findings into structured, grounded evidence payloads.

import prisma from '../../../config/database.js';
import { AnalyticsDataService } from '../../analytics/analyticsData.service.js';
import { seoFindingService } from '../../seo-analysis/services/seo-finding.service.js';
import { aiGuardrailService } from './ai-guardrail.service.js';
import logger from '../../../utils/logger.js';

const analyticsDataService = new AnalyticsDataService();

export const AI_INTENTS = {
  TRAFFIC_ANALYSIS: 'TRAFFIC_ANALYSIS',
  KEYWORD_OPPORTUNITIES: 'KEYWORD_OPPORTUNITIES',
  USER_BEHAVIOUR: 'USER_BEHAVIOUR',
  SEO_FINDINGS: 'SEO_FINDINGS',
  GENERAL_PERFORMANCE: 'GENERAL_PERFORMANCE',
};

export class AIContextService {
  /**
   * Deterministically classify user message intent.
   * @param {string} message
   * @returns {string} - AI_INTENTS enum value
   */
  classifyIntent(message = '') {
    const text = message.toLowerCase();

    // Check user behaviour / UX friction
    if (
      text.includes('clarity') ||
      text.includes('rage click') ||
      text.includes('dead click') ||
      text.includes('friction') ||
      text.includes('usability') ||
      text.includes('user behavior') ||
      text.includes('user behaviour') ||
      text.includes('ux') ||
      text.includes('script error')
    ) {
      return AI_INTENTS.USER_BEHAVIOUR;
    }

    // Check keyword opportunities / striking distance
    if (
      text.includes('keyword') ||
      text.includes('striking distance') ||
      text.includes('query') ||
      text.includes('queries') ||
      text.includes('ranking') ||
      text.includes('serp') ||
      text.includes('search console') ||
      text.includes('gsc') ||
      text.includes('impressions') ||
      text.includes('ctr')
    ) {
      return AI_INTENTS.KEYWORD_OPPORTUNITIES;
    }

    // Check traffic drop / performance shift
    if (
      text.includes('traffic') ||
      text.includes('drop') ||
      text.includes('fall') ||
      text.includes('decline') ||
      text.includes('loss') ||
      text.includes('organic session') ||
      text.includes('ga4') ||
      text.includes('analytics') ||
      text.includes('visitor') ||
      text.includes('bounce')
    ) {
      return AI_INTENTS.TRAFFIC_ANALYSIS;
    }

    // Check SEO issues / findings / audit
    if (
      text.includes('finding') ||
      text.includes('issue') ||
      text.includes('audit') ||
      text.includes('opportunity') ||
      text.includes('recommend') ||
      text.includes('decay') ||
      text.includes('anomaly') ||
      text.includes('critical') ||
      text.includes('action')
    ) {
      return AI_INTENTS.SEO_FINDINGS;
    }

    return AI_INTENTS.GENERAL_PERFORMANCE;
  }

  /**
   * Retrieve website metadata and connected integration status.
   */
  async getWebsiteContext(workspaceId, websiteId) {
    if (!websiteId) return null;

    try {
      const website = await prisma.website.findFirst({
        where: { id: websiteId, workspaceId },
        include: {
          client: { select: { id: true, name: true } },
          integrations: {
            select: {
              integrationType: true,
              status: true,
              lastSyncAt: true,
            },
          },
        },
      });

      if (!website) return null;

      // Check Clarity connection
      const clarityConn = await prisma.clarityConnection.findFirst({
        where: { workspaceId },
        select: { projectId: true, status: true, lastSyncAt: true },
      }).catch(() => null);

      return {
        id: website.id,
        domain: website.domain,
        clientName: website.client?.name || 'Unknown Client',
        integrations: {
          ga4: website.integrations?.find(i => i.integrationType === 'ga4')?.status === 'connected',
          gsc: website.integrations?.find(i => i.integrationType === 'gsc')?.status === 'connected',
          clarity: clarityConn?.status === 'active' || clarityConn?.status === 'CONNECTED',
        },
      };
    } catch (err) {
      logger.warn('Failed to retrieve website context:', { error: err.message });
      return null;
    }
  }

  /**
   * Fetch cross-platform metrics and summary stats.
   */
  async getAnalyticsSummary(workspaceId, websiteId) {
    if (!websiteId) return null;

    try {
      const overview = await analyticsDataService.getCrossPlatformOverview(
        workspaceId,
        websiteId,
        {}
      ).catch(() => null);

      return overview;
    } catch (err) {
      logger.warn('Failed to fetch analytics summary:', { error: err.message });
      return null;
    }
  }

  /**
   * Fetch striking distance keywords (ranking 4-20) with high impressions.
   */
  async getStrikingDistanceKeywords(websiteId, limit = 10) {
    if (!websiteId) return [];

    try {
      const keywords = await prisma.gSCQueryMetric.findMany({
        where: {
          websiteId,
          position: { gte: 4.0, lte: 20.0 },
          impressions: { gte: 50 },
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
      }).catch(() => []);

      return keywords;
    } catch {
      return [];
    }
  }

  /**
   * Fetch top decline or top traffic landing pages.
   */
  async getTopLandingPages(websiteId, limit = 10) {
    if (!websiteId) return [];

    try {
      const pages = await prisma.gSCPageMetric.findMany({
        where: { websiteId },
        orderBy: { clicks: 'desc' },
        take: limit,
        select: {
          page: true,
          clicks: true,
          impressions: true,
          ctr: true,
          position: true,
        },
      }).catch(() => []);

      return pages;
    } catch {
      return [];
    }
  }

  /**
   * Fetch Clarity UX friction hotspots (pages with rage/dead clicks).
   */
  async getClarityFrictionPages(websiteId, limit = 10) {
    if (!websiteId) return [];

    try {
      const frictionPages = await prisma.clarityPageMetric.findMany({
        where: { websiteId },
        orderBy: [{ deadClicks: 'desc' }, { rageClicks: 'desc' }],
        take: limit,
        select: {
          url: true,
          visits: true,
          deadClicks: true,
          rageClicks: true,
          excessiveScrolls: true,
          quickBacks: true,
          scriptErrors: true,
        },
      }).catch(() => []);

      return frictionPages;
    } catch {
      return [];
    }
  }

  /**
   * Fetch Phase 7 Deterministic Findings.
   */
  async getSEOFindings(workspaceId, websiteId, limit = 15) {
    if (!websiteId) return { findings: [], stats: null };

    try {
      const [findingsResult, stats] = await Promise.all([
        seoFindingService.getFindings(workspaceId, websiteId, {
          status: 'OPEN',
          limit,
        }).catch(() => ({ findings: [], pagination: { total: 0 } })),
        seoFindingService.getWebsiteOverviewStats(workspaceId, websiteId).catch(() => null),
      ]);

      const findings = findingsResult?.findings || [];
      return {
        findings: findings.map(f => ({
          id: f.id,
          type: f.type,
          severity: f.severity,
          priority: f.priority,
          title: f.title,
          description: f.description,
          impactScore: f.impactScore,
          affectedEntity: f.affectedEntity,
          evidence: f.evidence,
          recommendations: f.recommendations,
          detectedAt: f.detectedAt,
        })),
        stats,
      };
    } catch (err) {
      logger.warn('Failed to fetch SEO findings:', { error: err.message });
      return { findings: [], stats: null };
    }
  }

  /**
   * Assemble full grounded context for an AI prompt.
   * @param {string} workspaceId
   * @param {string} websiteId
   * @param {string} userMessage
   * @returns {Promise<{ intent: string, contextString: string, evidenceMeta: object }>}
   */
  async buildContext(workspaceId, websiteId, userMessage) {
    const intent = this.classifyIntent(userMessage);

    const [
      websiteCtx,
      analyticsOverview,
      strikingKeywords,
      topPages,
      clarityFriction,
      seoFindingsData,
    ] = await Promise.all([
      this.getWebsiteContext(workspaceId, websiteId),
      this.getAnalyticsSummary(workspaceId, websiteId),
      this.getStrikingDistanceKeywords(websiteId, 10),
      this.getTopLandingPages(websiteId, 10),
      this.getClarityFrictionPages(websiteId, 10),
      this.getSEOFindings(workspaceId, websiteId, 12),
    ]);

    const contextPayload = {
      website: websiteCtx,
      intent,
      analyticsOverview: analyticsOverview
        ? {
            period: analyticsOverview.period,
            comparisonPeriod: analyticsOverview.comparisonPeriod,
            ga4Summary: analyticsOverview.ga4Summary,
            gscSummary: analyticsOverview.gscSummary,
            claritySummary: analyticsOverview.claritySummary,
          }
        : null,
      topPages: topPages.slice(0, 8),
      strikingKeywords: strikingKeywords.slice(0, 8),
      clarityFrictionPages: clarityFriction.slice(0, 8),
      deterministicFindings: seoFindingsData.findings,
      findingStats: seoFindingsData.stats,
    };

    const contextString = aiGuardrailService.budgetContext(contextPayload, 8000);

    const evidenceMeta = {
      domain: websiteCtx?.domain || 'N/A',
      client: websiteCtx?.clientName || 'N/A',
      intent,
      integrations: websiteCtx?.integrations || {},
      hasGA4: Boolean(websiteCtx?.integrations?.ga4),
      hasGSC: Boolean(websiteCtx?.integrations?.gsc),
      hasClarity: Boolean(websiteCtx?.integrations?.clarity),
      findingsCount: seoFindingsData.findings?.length || 0,
      criticalFindings: seoFindingsData.stats?.bySeverity?.CRITICAL || 0,
    };

    return {
      intent,
      contextString,
      evidenceMeta,
    };
  }
}

export const aiContextService = new AIContextService();
