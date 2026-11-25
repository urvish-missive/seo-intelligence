// backend/src/modules/ai/services/ai-context.service.js
// Context retrieval service: collects website data, GA4, GSC, Clarity metrics
// and SEO findings into a compact, grounded evidence block for the local LLM.
//
// The context is plain text (not pretty-printed JSON) and kept small, because
// local models have a limited context window: anything over it is cut from the
// START of the prompt, which silently drops the system prompt and grounding rules.

import prisma from '../../../config/database.js';
import { AnalyticsDataService } from '../../analytics/analyticsData.service.js';
import logger from '../../../utils/logger.js';

const analyticsDataService = new AnalyticsDataService();

export const AI_INTENTS = {
  TRAFFIC_ANALYSIS: 'TRAFFIC_ANALYSIS',
  KEYWORD_OPPORTUNITIES: 'KEYWORD_OPPORTUNITIES',
  USER_BEHAVIOUR: 'USER_BEHAVIOUR',
  SEO_FINDINGS: 'SEO_FINDINGS',
  GENERAL_PERFORMANCE: 'GENERAL_PERFORMANCE',
};

// Findings in these states still need attention
const ACTIVE_FINDING_STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'REOPENED', 'ACKNOWLEDGED'];
const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 };

// Default analysis window: last 28 complete days vs the 28 days before
const WINDOW_DAYS = 28;
const CONTEXT_CHAR_BUDGET = 9000; // ~2,250 tokens, leaves room for prompt + answer

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function requestedClarityRange(message = '') {
  const text = message.toLowerCase();
  const match = text.match(/(?:last|past|previous)\s+(\d+)\s+days?/);
  const days = match ? Math.min(30, Math.max(1, Number(match[1]))) : null;
  if (!days || !/(clarity|session|visitor|behavio|friction)/.test(text)) return null;
  return { startDate: daysAgo(days), endDate: daysAgo(1), days };
}

/** Read a metric that may be a number or a { current|value, percentChange } object. */
function metricValue(m) {
  if (m === null || m === undefined) return null;
  if (typeof m === 'object') return m.current ?? m.value ?? null;
  return m;
}

function fmtNum(v, decimals = 0) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return 'n/a';
  return Number(v).toLocaleString('en-GB', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

function fmtChange(m) {
  const pct = m && typeof m === 'object' ? m.percentChange : null;
  if (pct === null || pct === undefined) return '';
  return ` (${pct > 0 ? '+' : ''}${Number(pct).toFixed(1)}% vs previous period)`;
}

const line = (label, m, decimals = 0, suffix = '') =>
  `- ${label}: ${fmtNum(metricValue(m), decimals)}${suffix}${fmtChange(m)}`;

export class AIContextService {
  /**
   * Deterministically classify user message intent.
   * @param {string} message
   * @returns {string} - AI_INTENTS enum value
   */
  classifyIntent(message = '') {
    const text = message.toLowerCase();
    const has = (...words) => words.some((w) => text.includes(w));

    if (has('clarity', 'rage click', 'dead click', 'friction', 'usability', 'user behavior', 'user behaviour', ' ux', 'ux ', 'script error', 'scroll', 'quick back', 'quickback')) {
      return AI_INTENTS.USER_BEHAVIOUR;
    }
    if (has('keyword', 'striking distance', 'query', 'queries', 'ranking', 'rank ', 'serp', 'search console', 'gsc', 'impressions', 'ctr', 'position')) {
      return AI_INTENTS.KEYWORD_OPPORTUNITIES;
    }
    if (has('traffic', 'drop', 'fall', 'decline', 'loss', 'organic session', 'ga4', 'analytics', 'visitor', 'bounce', 'session', 'conversion')) {
      return AI_INTENTS.TRAFFIC_ANALYSIS;
    }
    if (has('finding', 'issue', 'audit', 'opportunit', 'recommend', 'decay', 'anomaly', 'critical', 'action', 'fix', 'priorit')) {
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

      const isConnected = (value) => ['CONNECTED', 'SYNCING'].includes(String(value || '').toUpperCase());
      const find = (type) => website.integrations?.find((i) => i.integrationType?.toUpperCase() === type);

      return {
        id: website.id,
        domain: website.domain,
        clientName: website.client?.name || 'Unknown Client',
        integrations: {
          ga4: isConnected(find('GA4')?.status),
          gsc: isConnected(find('GSC')?.status),
          clarity: isConnected(find('CLARITY')?.status),
        },
        lastSync: {
          ga4: find('GA4')?.lastSyncAt || null,
          gsc: find('GSC')?.lastSyncAt || null,
          clarity: find('CLARITY')?.lastSyncAt || null,
        },
      };
    } catch (err) {
      logger.warn('Failed to retrieve website context:', { error: err.message });
      return null;
    }
  }

  /**
   * Cross-platform KPIs for the last 28 days with previous-period comparison.
   */
  async getAnalyticsSummary(workspaceId, websiteId) {
    if (!websiteId) return null;

    const startDate = daysAgo(WINDOW_DAYS);
    const endDate = daysAgo(1);
    try {
      const [overview, ga4] = await Promise.all([
        analyticsDataService.getWebsiteOverview(workspaceId, websiteId, { startDate, endDate, compare: true }),
        analyticsDataService.getGA4Summary(workspaceId, websiteId, { startDate, endDate, compare: true }).catch(() => null),
      ]);

      // How many days actually have data in each period. Comparisons against a
      // barely-synced previous period produce huge, meaningless % changes.
      const countDays = (model, range) =>
        model.count({ where: { websiteId, date: { gte: range.startDate, lte: range.endDate } } }).catch(() => 0);
      const prevRange = overview.comparisonRange;
      const [gscCur, gscPrev, ga4Cur, ga4Prev] = await Promise.all([
        countDays(prisma.gSCDailyMetric, overview.dateRange),
        prevRange ? countDays(prisma.gSCDailyMetric, prevRange) : 0,
        countDays(prisma.gA4DailyMetric, overview.dateRange),
        prevRange ? countDays(prisma.gA4DailyMetric, prevRange) : 0,
      ]);

      return {
        coverage: { gsc: { current: gscCur, previous: gscPrev }, ga4: { current: ga4Cur, previous: ga4Prev }, days: overview.dateRange?.daysCount },
        period: overview.dateRange,
        comparisonPeriod: overview.comparisonRange,
        kpis: overview.kpis || {},
        ga4Engagement: ga4?.summary
          ? {
              engagementRate: ga4.summary.engagementRate,
              bounceRate: ga4.summary.bounceRate,
              avgEngagementTime: ga4.summary.avgEngagementTime,
              newUsers: ga4.summary.newUsers,
            }
          : null,
        claritySummary: overview.claritySummary || null,
      };
    } catch (err) {
      logger.warn('Failed to fetch analytics summary for AI context:', { error: err.message });
      return null;
    }
  }

  /**
   * Striking-distance keywords (position 4-20), aggregated over the window.
   */
  async getStrikingDistanceKeywords(websiteId, limit = 10, workspaceId = null) {
    if (!websiteId || !workspaceId) return [];
    try {
      const opps = await analyticsDataService.getGSCOpportunities(workspaceId, websiteId, {
        startDate: daysAgo(WINDOW_DAYS),
        endDate: daysAgo(1),
      });
      return (opps.strikingDistance || []).slice(0, limit).map((q) => ({
        query: q.query,
        clicks: q.clicks,
        impressions: q.impressions,
        ctr: q.ctr,
        position: q.avgPosition ?? q.position,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Top search queries and pages by clicks, aggregated over the window.
   */
  async getTopSearchData(workspaceId, websiteId, limit = 8) {
    if (!websiteId) return { queries: [], lowCtr: [] };
    const range = { startDate: daysAgo(WINDOW_DAYS), endDate: daysAgo(1) };
    try {
      const [queries, opps] = await Promise.all([
        analyticsDataService.getGSCTopQueries(workspaceId, websiteId, { ...range, limit }),
        analyticsDataService.getGSCOpportunities(workspaceId, websiteId, range),
      ]);
      return { queries: queries.queries || [], lowCtr: (opps.lowCtrOpportunities || []).slice(0, 6) };
    } catch {
      return { queries: [], lowCtr: [] };
    }
  }

  /**
   * Top pages: GSC pages by clicks plus GA4 landing pages by sessions.
   */
  async getTopLandingPages(websiteId, limit = 8, workspaceId = null) {
    if (!websiteId || !workspaceId) return [];
    const range = { startDate: daysAgo(WINDOW_DAYS), endDate: daysAgo(1), limit };
    try {
      const [gscPages, ga4Pages] = await Promise.all([
        analyticsDataService.getGSCTopPages(workspaceId, websiteId, range).catch(() => ({ pages: [] })),
        analyticsDataService.getGA4LandingPages(workspaceId, websiteId, range).catch(() => ({ pages: [] })),
      ]);
      return [
        ...(gscPages.pages || []).map((p) => ({ source: 'GSC', page: p.page, clicks: p.clicks, impressions: p.impressions, ctr: p.ctr, position: p.avgPosition })),
        ...(ga4Pages.pages || []).map((p) => ({ source: 'GA4', page: p.landingPage, sessions: p.sessions, engagementRate: p.engagementRate, conversions: p.conversions })),
      ];
    } catch {
      return [];
    }
  }

  /**
   * Clarity UX friction: latest import totals and the worst pages.
   */
  async getClarityFrictionPages(websiteId, limit = 8, workspaceId = null) {
    if (!websiteId || !workspaceId) return [];
    try {
      const summary = await analyticsDataService.getClaritySummary(workspaceId, websiteId);
      return (summary.topPages || []).slice(0, limit).map((p) => ({
        page: p.page,
        sessions: p.sessions,
        deadClicks: p.deadClicks,
        rageClicks: p.rageClicks,
        quickBacks: p.quickBacks,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Active SEO findings from the analysis engine, most severe first.
   */
  async getSEOFindings(workspaceId, websiteId, limit = 12) {
    if (!websiteId) return { findings: [], stats: null };

    try {
      const rows = await prisma.sEOFinding.findMany({
        where: { workspaceId, websiteId, status: { in: ACTIVE_FINDING_STATUSES } },
        orderBy: { detectedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          type: true,
          title: true,
          severity: true,
          priority: true,
          status: true,
          affectedTarget: true,
          currentValue: true,
          previousValue: true,
          changePercentage: true,
          suggestedAction: true,
          detectedAt: true,
        },
      });

      const bySeverity = {};
      rows.forEach((f) => { bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1; });

      const findings = rows
        .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
        .slice(0, limit);

      return { findings, stats: { totalOpen: rows.length, bySeverity } };
    } catch (err) {
      logger.warn('Failed to fetch SEO findings:', { error: err.message });
      return { findings: [], stats: null };
    }
  }

  /**
   * Portfolio-level context when no website is selected.
   */
  async getWorkspacePortfolio(workspaceId, range = null) {
    try {
      const overview = await analyticsDataService.getAgencyOverview(workspaceId, {
        startDate: range?.startDate || daysAgo(WINDOW_DAYS),
        endDate: range?.endDate || daysAgo(1),
      });
      return overview;
    } catch (err) {
      logger.warn('Failed to fetch portfolio context:', { error: err.message });
      return null;
    }
  }

  /**
   * Render the evidence as compact text, most relevant sections first.
   */
  formatContext({ intent, website, analytics, topSearch, strikingKeywords, topPages, clarityFriction, seoFindings, portfolio, clarityRequested, clarityRecent }) {
    const sections = [];

    if (!website) {
      sections.push('SCOPE: Whole agency portfolio (no single website selected).');
      if (portfolio?.websites?.length) {
        sections.push(
          `PORTFOLIO (${portfolio.dateRange?.startDate} to ${portfolio.dateRange?.endDate}, change vs previous period):\n` +
            portfolio.websites
              .slice(0, 20)
              .map((w) => {
                const ch = (v) => (v === null || v === undefined ? '' : ` (${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%)`);
                const gsc = w.integrations?.gsc
                  ? `GSC clicks ${fmtNum(w.clicks)}${ch(w.changes?.clicks)}, impressions ${fmtNum(w.impressions)}, avg position ${fmtNum(w.avgPosition, 1)}`
                  : 'GSC not connected';
                const ga4 = w.integrations?.ga4
                  ? `GA4 sessions ${fmtNum(w.sessions)}${ch(w.changes?.sessions)}, users ${fmtNum(w.users)}`
                  : 'GA4 not connected';
                const clarity = clarityRequested
                  ? w.integrations?.clarity
                    ? `Clarity sessions ${fmtNum(w.claritySessions)}${w.integrationDetails?.find((i) => i.integrationType === 'CLARITY')?.lastSyncAt ? ` (last synced ${new Date(w.integrationDetails.find((i) => i.integrationType === 'CLARITY').lastSyncAt).toISOString().slice(0, 10)})` : ' (no import timestamp)'}`
                    : 'Clarity not connected to this website'
                  : '';
                return `- ${w.domain} [${w.clientName}]: ${gsc}; ${ga4}${clarity ? `; ${clarity}` : ''}`;
              })
              .join('\n')
        );
      } else {
        sections.push('No websites with synced data found in this workspace.');
      }
      if (clarityRequested) sections.unshift(`CLARITY REQUEST: sessions over ${clarityRequested.days} days (${clarityRequested.startDate} to ${clarityRequested.endDate}); portfolio counts are per website and come from stored Clarity imports.`);
      return sections.join('\n\n');
    }

    const integ = website.integrations || {};
    const yn = (b) => (b ? 'connected' : 'NOT connected');
    sections.push(
      `WEBSITE: ${website.domain} (client: ${website.clientName})\n` +
        `Integrations: GA4 ${yn(integ.ga4)}, Search Console ${yn(integ.gsc)}, Clarity ${yn(integ.clarity)}`
    );

    // Core KPIs
    if (analytics) {
      const k = analytics.kpis || {};
      const p = analytics.period;
      const c = analytics.comparisonPeriod;
      const kpiLines = [
        `PERIOD: ${p?.startDate || '?'} to ${p?.endDate || '?'}${c ? ` (compared with ${c.startDate} to ${c.endDate})` : ''}`,
      ];
      const cov = analytics.coverage;
      if (cov) {
        const note = (name, x) => {
          if (!x || x.current === 0) return `${name}: no synced days in this period.`;
          const unreliable = x.previous < Math.max(1, Math.floor(x.current * 0.8));
          return `${name}: ${x.current} days of data in this period, ${x.previous} in the previous period${unreliable ? ' (previous period not fully synced, so % changes are NOT reliable; do not report them as real growth)' : ''}.`;
        };
        kpiLines.push(`DATA COVERAGE: ${note('Search Console', cov.gsc)} ${note('GA4', cov.ga4)}`);
      }
      if (integ.ga4 !== false) {
        kpiLines.push(
          'GA4:',
          line('Sessions', k.sessions),
          line('Organic sessions', k.organicSessions),
          line('Users', k.users),
          line('Page views', k.pageViews),
          line('Conversions', k.conversions)
        );
        const e = analytics.ga4Engagement;
        if (e) {
          kpiLines.push(line('Engagement rate', e.engagementRate, 1, '%'), line('Bounce rate', e.bounceRate, 1, '%'), line('Avg engagement time (s)', e.avgEngagementTime));
        }
      }
      if (integ.gsc !== false) {
        kpiLines.push(
          'SEARCH CONSOLE:',
          line('Clicks', k.clicks),
          line('Impressions', k.impressions),
          line('CTR', k.ctr, 2, '%'),
          line('Average position (lower is better)', k.avgPosition, 1)
        );
      }
      if (analytics.claritySummary && integ.clarity) {
        const cs = analytics.claritySummary;
        kpiLines.push(
          'CLARITY (imported days in period):',
          `- Sessions ${fmtNum(cs.totalSessions ?? metricValue(cs.sessions))}, rage clicks ${fmtNum(cs.rageClicks)}, dead clicks ${fmtNum(cs.deadClicks)}, quick backs ${fmtNum(cs.quickbacks)}, script errors ${fmtNum(cs.scriptErrors)}`
        );
      }
      sections.push(kpiLines.join('\n'));
    } else {
      sections.push('ANALYTICS: No synced GA4/GSC data available for the last 28 days.');
    }

    if (clarityRequested) {
      const cs = clarityRecent;
      const imported = Boolean(cs?.reportingWindow || cs?.coverage);
      sections.push(
        `CLARITY REQUEST (${clarityRequested.startDate} to ${clarityRequested.endDate}): ${integ.clarity ? 'connected to this website' : 'not connected to this website'}. ` +
        (integ.clarity && imported
          ? `Latest import ${cs.reportingWindow?.lastImportAt ? new Date(cs.reportingWindow.lastImportAt).toISOString().slice(0, 10) : 'date unavailable'}; sessions in the requested range: ${fmtNum(cs?.friction?.totalSessions)}. Coverage: ${cs?.coverage?.from ? `${cs.coverage.from} to ${cs.coverage.to}` : 'no stored import covers this range'}.`
          : integ.clarity
            ? 'No completed Clarity import is recorded for this website yet.'
            : 'The workspace may have a Clarity project connected, but this website has no active Clarity mapping.')
      );
    }

    const keywordBlock = () => {
      const parts = [];
      if (topSearch?.queries?.length) {
        parts.push(
          'TOP SEARCH QUERIES (clicks / impressions / CTR / avg position):\n' +
            topSearch.queries.map((q) => `- "${q.query}": ${fmtNum(q.clicks)} / ${fmtNum(q.impressions)} / ${fmtNum(q.ctr, 2)}% / ${fmtNum(q.avgPosition ?? q.position, 1)}`).join('\n')
        );
      }
      if (strikingKeywords?.length) {
        parts.push(
          'STRIKING-DISTANCE KEYWORDS (position 4-20):\n' +
            strikingKeywords.map((q) => `- "${q.query}": position ${fmtNum(q.position ?? q.avgPosition, 1)}, ${fmtNum(q.impressions)} impressions, ${fmtNum(q.clicks)} clicks`).join('\n')
        );
      }
      if (topSearch?.lowCtr?.length) {
        parts.push(
          'HIGH IMPRESSIONS, LOW CTR (<2%):\n' +
            topSearch.lowCtr.map((q) => `- "${q.query}": ${fmtNum(q.impressions)} impressions, CTR ${fmtNum(q.ctr, 2)}%, position ${fmtNum(q.avgPosition ?? q.position, 1)}`).join('\n')
        );
      }
      return parts.join('\n\n');
    };

    const pagesBlock = () => {
      if (!topPages?.length) return '';
      const gsc = topPages.filter((p) => p.source === 'GSC' || p.clicks !== undefined);
      const ga4 = topPages.filter((p) => p.source === 'GA4');
      const parts = [];
      if (gsc.length) {
        parts.push('TOP PAGES IN SEARCH (clicks / impressions / position):\n' + gsc.map((p) => `- ${p.page}: ${fmtNum(p.clicks)} / ${fmtNum(p.impressions)} / ${fmtNum(p.position, 1)}`).join('\n'));
      }
      if (ga4.length) {
        parts.push('TOP LANDING PAGES (sessions / engagement rate / conversions):\n' + ga4.map((p) => `- ${p.page}: ${fmtNum(p.sessions)} / ${fmtNum(p.engagementRate, 1)}% / ${fmtNum(p.conversions)}`).join('\n'));
      }
      return parts.join('\n\n');
    };

    const clarityBlock = () =>
      clarityFriction?.length
        ? 'CLARITY FRICTION PAGES (sessions / dead clicks / rage clicks / quick backs):\n' +
          clarityFriction.map((p) => `- ${p.page || p.url}: ${fmtNum(p.sessions)} / ${fmtNum(p.deadClicks)} / ${fmtNum(p.rageClicks)} / ${fmtNum(p.quickBacks)}`).join('\n')
        : '';

    const findingsBlock = () => {
      const f = seoFindings?.findings || [];
      if (!f.length) return 'SEO FINDINGS: none open.';
      const stats = seoFindings.stats;
      const header = stats
        ? `OPEN SEO FINDINGS (${stats.totalOpen} total; ${Object.entries(stats.bySeverity || {}).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(', ')}):`
        : 'OPEN SEO FINDINGS:';
      return (
        header +
        '\n' +
        f
          .map((x) => {
            const change = x.changePercentage !== null && x.changePercentage !== undefined ? ` (${x.changePercentage > 0 ? '+' : ''}${Number(x.changePercentage).toFixed(1)}%)` : '';
            const target = x.affectedTarget ? ` on ${x.affectedTarget}` : '';
            const action = x.suggestedAction ? ` Suggested: ${String(x.suggestedAction).slice(0, 160)}` : '';
            return `- [${x.severity}] ${x.title}${target}${change}.${action}`;
          })
          .join('\n')
      );
    };

    // Order sections by what the question is about
    const order = {
      [AI_INTENTS.KEYWORD_OPPORTUNITIES]: [keywordBlock, pagesBlock, findingsBlock, clarityBlock],
      [AI_INTENTS.TRAFFIC_ANALYSIS]: [pagesBlock, keywordBlock, findingsBlock, clarityBlock],
      [AI_INTENTS.USER_BEHAVIOUR]: [clarityBlock, pagesBlock, findingsBlock, keywordBlock],
      [AI_INTENTS.SEO_FINDINGS]: [findingsBlock, keywordBlock, pagesBlock, clarityBlock],
      [AI_INTENTS.GENERAL_PERFORMANCE]: [keywordBlock, pagesBlock, findingsBlock, clarityBlock],
    }[intent] || [keywordBlock, pagesBlock, findingsBlock, clarityBlock];

    for (const build of order) {
      const block = build();
      if (block) sections.push(block);
    }

    // Keep within budget by dropping the least relevant (last) sections first
    let text = sections.join('\n\n');
    while (text.length > CONTEXT_CHAR_BUDGET && sections.length > 2) {
      sections.pop();
      text = sections.join('\n\n');
    }
    return text.length > CONTEXT_CHAR_BUDGET ? `${text.slice(0, CONTEXT_CHAR_BUDGET)}\n[context truncated]` : text;
  }

  /**
   * Assemble full grounded context for an AI prompt.
   * @returns {Promise<{ intent: string, contextString: string, evidenceMeta: object }>}
   */
  async buildContext(workspaceId, websiteId, userMessage) {
    const intent = this.classifyIntent(userMessage);
    const clarityRequested = requestedClarityRange(userMessage);

    const [
      website,
      analytics,
      strikingKeywords,
      topPages,
      clarityFriction,
      seoFindings,
      topSearch,
      portfolio,
      clarityRecent,
    ] = await Promise.all([
      this.getWebsiteContext(workspaceId, websiteId),
      this.getAnalyticsSummary(workspaceId, websiteId),
      this.getStrikingDistanceKeywords(websiteId, 10, workspaceId),
      this.getTopLandingPages(websiteId, 8, workspaceId),
      this.getClarityFrictionPages(websiteId, 8, workspaceId),
      this.getSEOFindings(workspaceId, websiteId, 12),
      this.getTopSearchData(workspaceId, websiteId, 10),
      websiteId ? Promise.resolve(null) : this.getWorkspacePortfolio(workspaceId, clarityRequested),
      websiteId && clarityRequested
        ? analyticsDataService.getClaritySummary(workspaceId, websiteId, clarityRequested).catch(() => null)
        : Promise.resolve(null),
    ]);

    const contextString = this.formatContext({
      intent,
      website,
      analytics,
      topSearch,
      strikingKeywords,
      topPages,
      clarityFriction,
      seoFindings,
      portfolio,
      clarityRequested,
      clarityRecent,
    });

    const evidenceMeta = {
      domain: website?.domain || (websiteId ? 'N/A' : 'All websites'),
      client: website?.clientName || 'N/A',
      intent,
      period: analytics?.period || null,
      integrations: website?.integrations || {},
      hasGA4: Boolean(website?.integrations?.ga4),
      hasGSC: Boolean(website?.integrations?.gsc),
      hasClarity: Boolean(website?.integrations?.clarity),
      findingsCount: seoFindings?.findings?.length || 0,
      criticalFindings: seoFindings?.stats?.bySeverity?.CRITICAL || 0,
    };

    return { intent, contextString, evidenceMeta };
  }
}

export const aiContextService = new AIContextService();
