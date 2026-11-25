// backend/src/modules/reports/services/report-data-aggregator.service.js
// Aggregates real data across GA4, GSC, Clarity, and SEO Engine with optional AI summary.

import prisma from '../../../config/database.js';
import { AnalyticsDataService } from '../../analytics/analyticsData.service.js';
import { SEOFindingService } from '../../seo-analysis/services/seo-finding.service.js';
import { ollamaService } from '../../ai/services/ollama.service.js';
import { calculateComparisonPeriod, formatDateHuman } from '../utils/date-range.utils.js';
import logger from '../../../utils/logger.js';

const analyticsService = new AnalyticsDataService();
const findingService = new SEOFindingService();

const cur = (m) => (m && typeof m === 'object' ? (m.current ?? 0) : (m ?? 0));
const prv = (m) => (m && typeof m === 'object' ? (m.previous ?? 0) : 0);
const pct = (m) => (m && typeof m === 'object' && m.percentChange !== undefined ? m.percentChange : null);

/** Flatten GA4 comparison metrics into the shape the report generators read. */
export function flattenGA4Summary(ga4Summary) {
  const s = ga4Summary?.summary;
  if (!s) return { summary: null, comparison: null };
  return {
    summary: {
      sessions: cur(s.sessions),
      totalUsers: cur(s.totalUsers),
      activeUsers: cur(s.activeUsers),
      newUsers: cur(s.newUsers),
      organicSessions: cur(s.organicSessions),
      engagedSessions: cur(s.engagedSessions),
      engagementRate: cur(s.engagementRate),
      avgEngagementTime: cur(s.avgEngagementTime),
      bounceRate: cur(s.bounceRate),
      screenPageViews: cur(s.screenPageViews),
      conversions: cur(s.conversions),
    },
    comparison: {
      previousSessions: prv(s.sessions),
      previousUsers: prv(s.totalUsers),
      sessionsChangePercent: pct(s.sessions),
      usersChangePercent: pct(s.totalUsers),
      organicSessionsChangePercent: pct(s.organicSessions),
      engagementRateChangePercent: pct(s.engagementRate),
      conversionsChangePercent: pct(s.conversions),
    },
  };
}

/** Flatten GSC comparison metrics into the shape the report generators read. */
export function flattenGSCSummary(gscSummary) {
  const s = gscSummary?.summary;
  if (!s) return { summary: null, comparison: null };
  return {
    summary: {
      clicks: cur(s.clicks),
      impressions: cur(s.impressions),
      ctr: cur(s.ctr),
      averagePosition: cur(s.avgPosition),
      avgPosition: cur(s.avgPosition),
    },
    comparison: {
      previousClicks: prv(s.clicks),
      previousImpressions: prv(s.impressions),
      clicksChangePercent: pct(s.clicks),
      impressionsChangePercent: pct(s.impressions),
      ctrChangePercent: pct(s.ctr),
      positionChange: s.avgPosition ? s.avgPosition.absoluteChange : null,
    },
  };
}

export class ReportDataAggregatorService {
  /**
   * Aggregate complete dataset for a specific report configuration.
   */
  async aggregateReportData({
    workspaceId,
    websiteId,
    reportType,
    periodStart,
    periodEnd,
    comparisonStart: customCompStart,
    comparisonEnd: customCompEnd,
    timezone = 'UTC',
    includeAiSummary = false,
    configuration = {},
  }) {
    // 1. Fetch website, client, and integrations
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        integrations: {
          select: {
            integrationType: true,
            status: true,
            lastSyncAt: true,
            selectedPropertyName: true,
          },
        },
      },
    });

    if (!website) {
      throw new Error(`Website with ID ${websiteId} not found in this workspace.`);
    }

    // 2. Fetch workspace agency branding
    const branding = await prisma.reportBranding.findUnique({
      where: { workspaceId },
    }) || {
      agencyName: 'Missive Digital Agency',
      brandPrimaryColor: '#4f46e5',
      brandSecondaryColor: '#0f172a',
      website: 'https://missive.digital',
      contactEmail: 'reports@missive.digital',
      footerText: 'Confidential Performance Intelligence · Prepared for Client',
    };

    // 3. Compute comparison periods
    let comparisonPeriod;
    if (customCompStart && customCompEnd) {
      comparisonPeriod = {
        comparisonStart: customCompStart,
        comparisonEnd: customCompEnd,
      };
    } else {
      comparisonPeriod = calculateComparisonPeriod(periodStart, periodEnd);
    }

    // 4. Inspect active integrations & data freshness
    const integrationsStatus = {
      GA4: website.integrations.find(i => (i.integrationType === 'GA4') && ['CONNECTED', 'SYNCING'].includes(i.status)),
      GSC: website.integrations.find(i => (i.integrationType === 'GSC' || i.integrationType === 'GOOGLE_SEARCH_CONSOLE') && ['CONNECTED', 'SYNCING'].includes(i.status)),
      CLARITY: website.integrations.find(i => (i.integrationType === 'CLARITY' || i.integrationType === 'MICROSOFT_CLARITY') && ['CONNECTED', 'SYNCING'].includes(i.status)),
    };

    const dataFreshness = {
      GA4: integrationsStatus.GA4 ? { connected: true, lastSyncAt: integrationsStatus.GA4.lastSyncAt } : { connected: false, message: 'Google Analytics 4 not connected' },
      GSC: integrationsStatus.GSC ? { connected: true, lastSyncAt: integrationsStatus.GSC.lastSyncAt } : { connected: false, message: 'Google Search Console not connected' },
      CLARITY: integrationsStatus.CLARITY ? { connected: true, lastSyncAt: integrationsStatus.CLARITY.lastSyncAt } : { connected: false, message: 'Microsoft Clarity not connected' },
    };

    // 5. Query data components concurrently
    const maxKeywords = configuration.maxKeywords || 25;
    const maxLandingPages = configuration.maxLandingPages || 25;

    const [
      overviewData,
      ga4Summary,
      ga4Sources,
      ga4LandingPages,
      gscSummary,
      gscQueries,
      gscPages,
      claritySummary,
      seoFindingsResult,
    ] = await Promise.all([
      // Cross-platform overview
      analyticsService.getWebsiteOverview(workspaceId, websiteId, {
        startDate: periodStart,
        endDate: periodEnd,
        compare: true,
      }).catch(err => {
        logger.warn(`Failed to fetch overview data for report: ${err.message}`);
        return null;
      }),

      // GA4 Summary
      integrationsStatus.GA4 ? analyticsService.getGA4Summary(workspaceId, websiteId, {
        startDate: periodStart,
        endDate: periodEnd,
        compare: true,
      }).catch(() => null) : null,

      // GA4 Sources
      integrationsStatus.GA4 ? analyticsService.getGA4TrafficSources(workspaceId, websiteId, {
        startDate: periodStart,
        endDate: periodEnd,
        limit: 10,
      }).catch(() => null) : null,

      // GA4 Landing Pages
      integrationsStatus.GA4 ? analyticsService.getGA4LandingPages(workspaceId, websiteId, {
        startDate: periodStart,
        endDate: periodEnd,
        limit: maxLandingPages,
      }).catch(() => null) : null,

      // GSC Summary
      integrationsStatus.GSC ? analyticsService.getGSCSummary(workspaceId, websiteId, {
        startDate: periodStart,
        endDate: periodEnd,
        compare: true,
      }).catch(() => null) : null,

      // GSC Queries
      integrationsStatus.GSC ? analyticsService.getGSCTopQueries(workspaceId, websiteId, {
        startDate: periodStart,
        endDate: periodEnd,
        limit: maxKeywords,
      }).catch(() => null) : null,

      // GSC Pages
      integrationsStatus.GSC ? analyticsService.getGSCTopPages(workspaceId, websiteId, {
        startDate: periodStart,
        endDate: periodEnd,
        limit: maxLandingPages,
      }).catch(() => null) : null,

      // Clarity UX Insights
      integrationsStatus.CLARITY ? analyticsService.getClaritySummary(workspaceId, websiteId, { startDate: periodStart, endDate: periodEnd }).catch(() => null) : null,

      // SEO Findings
      findingService.getFindings(workspaceId, websiteId, { limit: 20 }).catch(() => ({ findings: [], total: 0 })),
    ]);

    // Analytics summaries return { current, previous, percentChange } per metric;
    // the PDF/Excel generators and dashboard expect flat numbers + change percents.
    const ga4Flat = flattenGA4Summary(ga4Summary);
    const gscFlat = flattenGSCSummary(gscSummary);

    // 6. Calculate Keyword Opportunities (Striking distance: rank pos 4 - 20)
    let keywordOpportunities = [];
    if (gscQueries?.queries) {
      keywordOpportunities = gscQueries.queries
        .map(q => ({ ...q, position: q.position ?? q.avgPosition }))
        .filter(q => q.position >= 4 && q.position <= 20)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 15)
        .map(q => ({
          query: q.query,
          impressions: q.impressions,
          clicks: q.clicks,
          ctr: q.ctr,
          position: q.position,
          opportunityType: 'Striking Distance (Pos 4-20)',
          recommendation: q.ctr < 2.0
            ? 'Optimize meta title and description for higher search snippet CTR'
            : 'Improve on-page semantic content and internal linking to break into Top 3',
        }));
    }

    // 7. Calculate Traffic Drop Highlights
    const trafficChange = ga4Flat.comparison?.sessionsChangePercent ?? 0;

    const trafficDropAnalysis = {
      detected: trafficChange < -5,
      changePercent: trafficChange,
      status: trafficChange < -15 ? 'CRITICAL_DROP' : trafficChange < -5 ? 'MODERATE_DECLINE' : 'STABLE_OR_GROWING',
      currentSessions: ga4Flat.summary?.sessions || 0,
      previousSessions: ga4Flat.comparison?.previousSessions || 0,
      affectedPages: (ga4LandingPages?.pages || [])
        .filter(p => p.sessionsChangePercent < -10)
        .slice(0, 5),
    };

    // 8. Generate Executive Summary (AI with Deterministic Fallback)
    const executiveSummary = await this.generateExecutiveSummary({
      includeAiSummary,
      websiteName: website.name,
      domain: website.domain,
      periodStart,
      periodEnd,
      ga4Summary: ga4Flat,
      gscSummary: gscFlat,
      trafficChange,
      seoFindings: seoFindingsResult?.findings || [],
      keywordOpportunities,
      dataFreshness,
    });

    return {
      metadata: {
        websiteId: website.id,
        websiteName: website.name,
        domain: website.domain,
        clientName: website.client?.name || 'General Client',
        workspaceId,
        reportType,
        periodStart,
        periodEnd,
        comparisonStart: comparisonPeriod.comparisonStart,
        comparisonEnd: comparisonPeriod.comparisonEnd,
        generatedAt: new Date().toISOString(),
        timezone,
      },
      branding,
      dataFreshness,
      executiveSummary,
      metrics: {
        overview: overviewData,
        ga4: {
          available: !!integrationsStatus.GA4,
          summary: ga4Flat.summary,
          comparison: ga4Flat.comparison,
          trends: ga4Summary?.trends || [],
          sources: ga4Sources?.sources || [],
          landingPages: ga4LandingPages?.pages || [],
        },
        gsc: {
          available: !!integrationsStatus.GSC,
          summary: gscFlat.summary,
          comparison: gscFlat.comparison,
          trends: gscSummary?.trends || [],
          queries: gscQueries?.queries || [],
          pages: gscPages?.pages || [],
          opportunities: keywordOpportunities,
        },
        clarity: {
          available: !!integrationsStatus.CLARITY,
          summary: claritySummary
            ? {
                ...claritySummary,
                deadClicks: claritySummary.friction?.deadClickCount ?? 0,
                rageClicks: claritySummary.friction?.rageClickCount ?? 0,
                quickbacks: claritySummary.friction?.quickbackClickCount ?? 0,
                scriptErrors: claritySummary.friction?.scriptErrorCount ?? 0,
                excessiveScrolls: claritySummary.friction?.excessiveScrollCount ?? 0,
                totalSessions: claritySummary.friction?.totalSessions ?? 0,
                distinctUsers: claritySummary.friction?.distinctUsers ?? 0,
                avgScrollDepth: claritySummary.friction?.avgScrollDepth ?? 0,
              }
            : null,
          notice: 'Clarity data represents aggregate behavioral metrics across recorded visitor interactions.',
        },
        trafficDrop: trafficDropAnalysis,
        seoFindings: seoFindingsResult?.findings || [],
      },
    };
  }

  /**
   * Produce narrative summary (Local Ollama AI if requested and available, else deterministic).
   */
  async generateExecutiveSummary({
    includeAiSummary,
    websiteName,
    domain,
    periodStart,
    periodEnd,
    ga4Summary,
    gscSummary,
    trafficChange,
    seoFindings,
    keywordOpportunities,
    dataFreshness,
  }) {
    const formattedPeriod = `${formatDateHuman(periodStart)} to ${formatDateHuman(periodEnd)}`;
    const sessions = ga4Summary?.summary?.sessions || 0;
    const clicks = gscSummary?.summary?.clicks || 0;
    const impressions = gscSummary?.summary?.impressions || 0;
    const openFindingsCount = seoFindings.filter(f => !['RESOLVED', 'DISMISSED', 'IGNORED', 'CLOSED'].includes(String(f.status).toUpperCase())).length;

    // Rule-based deterministic summary
    let trendDirection = 'stable';
    if (trafficChange > 5) trendDirection = `increased by ${trafficChange.toFixed(1)}%`;
    else if (trafficChange < -5) trendDirection = `declined by ${Math.abs(trafficChange).toFixed(1)}%`;
    else trendDirection = 'remained broadly stable';

    // Only talk about sessions when GA4 is connected; otherwise "0 sessions,
    // broadly stable" is misleading.
    const ga4Connected = Boolean(dataFreshness?.GA4?.connected);
    const gscChange = gscSummary?.comparison?.clicksChangePercent;
    const gscTrend =
      gscChange === null || gscChange === undefined
        ? ''
        : ` Organic search clicks ${gscChange > 5 ? `increased by ${gscChange.toFixed(1)}%` : gscChange < -5 ? `declined by ${Math.abs(gscChange).toFixed(1)}%` : 'remained broadly stable'} compared to the previous equivalent period.`;
    const opening = ga4Connected
      ? `During the reporting period from ${formattedPeriod}, ${websiteName} (${domain}) recorded ${sessions.toLocaleString()} sessions and ${clicks.toLocaleString()} organic search clicks across ${impressions.toLocaleString()} search impressions. Overall session volume ${trendDirection} compared to the previous equivalent period.`
      : `During the reporting period from ${formattedPeriod}, ${websiteName} (${domain}) received ${clicks.toLocaleString()} organic search clicks across ${impressions.toLocaleString()} search impressions.${gscTrend} Google Analytics 4 is not connected, so on-site session and conversion figures are not included in this report.`;

    const deterministicSummary = [
      opening,
      keywordOpportunities.length > 0
        ? `A total of ${keywordOpportunities.length} high-potential striking distance search queries (ranking between positions 4 and 20) were identified, presenting near-term ranking advancement opportunities.`
        : 'Search ranking distributions across tracked queries remained concentrated in existing target brackets.',
      openFindingsCount > 0
        ? `The deterministic SEO engine identified ${openFindingsCount} active diagnostic findings requiring optimization or technical review.`
        : 'No critical technical SEO blockers or severe site health anomalies were detected during the analysis.',
    ].join('\n\n');

    if (!includeAiSummary) {
      return {
        text: deterministicSummary,
        source: 'DETERMINISTIC_RULES',
      };
    }

    // Attempt Local Ollama AI Summary
    try {
      const health = await ollamaService.checkHealth();
      if (!health.available || !health.modelPresent) {
        return {
          text: deterministicSummary,
          source: 'DETERMINISTIC_FALLBACK (Ollama offline)',
        };
      }

      const prompt = `You are a senior agency SEO director. Write a professional, concise executive summary (3 paragraphs, British English) for our client report based STRICTLY on the following verified facts:
Website: ${websiteName} (${domain})
Reporting Period: ${formattedPeriod}
Organic Sessions: ${sessions.toLocaleString()} (${trendDirection})
GSC Clicks: ${clicks.toLocaleString()}
GSC Impressions: ${impressions.toLocaleString()}
Striking Distance Keywords Found: ${keywordOpportunities.length}
Open Technical/Content Findings: ${openFindingsCount}
Integrations Connected: GA4: ${dataFreshness.GA4.connected}, GSC: ${dataFreshness.GSC.connected}, Clarity: ${dataFreshness.CLARITY.connected}

Rules:
1. State facts directly. Do not invent metrics or speculate without evidence.
2. Structure: Paragraph 1 - Overall Traffic & Engagement, Paragraph 2 - Search Performance & Keyword Opportunities, Paragraph 3 - Key Priorities for the Coming Month.
3. Keep the tone executive, objective, and actionable.`;

      const aiResponse = await ollamaService.generateCompletion({
        prompt,
        maxTokens: 500,
        temperature: 0.3,
      });

      if (aiResponse && aiResponse.text?.trim()) {
        return {
          text: aiResponse.text.trim(),
          source: 'LOCAL_OLLAMA_QWEN',
        };
      }
    } catch (err) {
      logger.warn(`Local Ollama executive summary generation failed, using deterministic fallback: ${err.message}`);
    }

    return {
      text: deterministicSummary,
      source: 'DETERMINISTIC_FALLBACK',
    };
  }
}

export const reportDataAggregatorService = new ReportDataAggregatorService();
