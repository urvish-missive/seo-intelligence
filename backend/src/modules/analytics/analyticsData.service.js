// backend/src/modules/analytics/analyticsData.service.js
// Production Analytics Service for GA4, GSC, Clarity, Multi-Website, and Cross-Platform intelligence.
// 100% offline querying against local MySQL with weighted statistical aggregations and period comparisons.

import prisma from '../../config/database.js';
import { NotFoundError, BadRequestError } from '../../middleware/errorHandler.js';
import { getComparisonDateRanges, calculateComparisonMetric } from '../../utils/analyticsDate.utils.js';

/**
 * Helper to compute default date N days ago as YYYY-MM-DD.
 */
function getDaysAgoDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export class AnalyticsDataService {
  /**
   * Helper to verify website belongs to workspace.
   */
  async verifyWebsite(workspaceId, websiteId) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
      include: {
        client: { select: { id: true, name: true } },
        integrations: {
          select: {
            integrationType: true,
            status: true,
            selectedProperty: true,
            selectedPropertyName: true,
            lastSyncAt: true,
            clarityConnection: {
              select: { apiCallsToday: true, apiCallsResetAt: true },
            },
          },
        },
      },
    });

    if (!website) {
      throw new NotFoundError('Website not found in this workspace.');
    }
    return website;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. CROSS-PLATFORM OVERVIEW (GA4 + GSC + CLARITY)
  // ───────────────────────────────────────────────────────────────────────────
  async getWebsiteOverview(workspaceId, websiteId, { startDate, endDate, compare = false } = {}) {
    const website = await this.verifyWebsite(workspaceId, websiteId);

    const start = startDate || getDaysAgoDate(28);
    const end = endDate || getDaysAgoDate(1);
    const dateRanges = getComparisonDateRanges(start, end);

    // Fetch Current Period Data
    const [ga4Current, gscCurrent, clarityDaily] = await Promise.all([
      prisma.gA4DailyMetric.findMany({
        where: { websiteId, date: { gte: dateRanges.current.startDate, lte: dateRanges.current.endDate } },
        orderBy: { date: 'asc' },
      }),
      prisma.gSCDailyMetric.findMany({
        where: { websiteId, date: { gte: dateRanges.current.startDate, lte: dateRanges.current.endDate } },
        orderBy: { date: 'asc' },
      }),
      prisma.clarityDailyMetric
        ? prisma.clarityDailyMetric
            .findMany({
              where: { websiteId },
              orderBy: { date: 'desc' },
              take: 3, // Latest rolling snapshots
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    // Fetch Previous Period Data if compare is true
    let ga4Prev = [];
    let gscPrev = [];
    if (compare) {
      [ga4Prev, gscPrev] = await Promise.all([
        prisma.gA4DailyMetric.findMany({
          where: { websiteId, date: { gte: dateRanges.previous.startDate, lte: dateRanges.previous.endDate } },
        }),
        prisma.gSCDailyMetric.findMany({
          where: { websiteId, date: { gte: dateRanges.previous.startDate, lte: dateRanges.previous.endDate } },
        }),
      ]);
    }

    // Aggregate Current GA4
    const currGA4Totals = ga4Current.reduce(
      (acc, r) => {
        acc.sessions += r.sessions;
        acc.organicSessions += r.organicSessions;
        acc.users += r.totalUsers;
        acc.conversions += r.conversions;
        acc.screenPageViews += r.screenPageViews;
        return acc;
      },
      { sessions: 0, organicSessions: 0, users: 0, conversions: 0, screenPageViews: 0 }
    );

    // Aggregate Previous GA4
    const prevGA4Totals = ga4Prev.reduce(
      (acc, r) => {
        acc.sessions += r.sessions;
        acc.organicSessions += r.organicSessions;
        acc.users += r.totalUsers;
        acc.conversions += r.conversions;
        acc.screenPageViews += r.screenPageViews;
        return acc;
      },
      { sessions: 0, organicSessions: 0, users: 0, conversions: 0, screenPageViews: 0 }
    );

    // Aggregate Current GSC
    const currGSCTotals = gscCurrent.reduce(
      (acc, r) => {
        acc.clicks += r.clicks;
        acc.impressions += r.impressions;
        acc.posWeight += r.avgPosition * r.impressions;
        return acc;
      },
      { clicks: 0, impressions: 0, posWeight: 0 }
    );

    // Aggregate Previous GSC
    const prevGSCTotals = gscPrev.reduce(
      (acc, r) => {
        acc.clicks += r.clicks;
        acc.impressions += r.impressions;
        acc.posWeight += r.avgPosition * r.impressions;
        return acc;
      },
      { clicks: 0, impressions: 0, posWeight: 0 }
    );

    const currCTR = currGSCTotals.impressions > 0 ? (currGSCTotals.clicks / currGSCTotals.impressions) * 100 : 0;
    const prevCTR = prevGSCTotals.impressions > 0 ? (prevGSCTotals.clicks / prevGSCTotals.impressions) * 100 : 0;
    const currPos = currGSCTotals.impressions > 0 ? currGSCTotals.posWeight / currGSCTotals.impressions : 0;
    const prevPos = prevGSCTotals.impressions > 0 ? prevGSCTotals.posWeight / prevGSCTotals.impressions : 0;

    // Aggregate Clarity Friction from latest available days
    const clarityTotals = clarityDaily.reduce(
      (acc, r) => {
        acc.sessions += r.sessions;
        acc.rageClicks += r.rageClickCount;
        acc.deadClicks += r.deadClickCount;
        acc.quickbacks += r.quickbackClickCount;
        acc.excessiveScrolls += r.excessiveScrollCount;
        acc.scriptErrors += r.scriptErrorCount;
        return acc;
      },
      { sessions: 0, rageClicks: 0, deadClicks: 0, quickbacks: 0, excessiveScrolls: 0, scriptErrors: 0 }
    );

    const totalFrictionEvents =
      clarityTotals.rageClicks +
      clarityTotals.deadClicks +
      clarityTotals.quickbacks +
      clarityTotals.excessiveScrolls +
      clarityTotals.scriptErrors;

    const frictionRate = clarityTotals.sessions > 0
      ? parseFloat(((totalFrictionEvents / clarityTotals.sessions) * 100).toFixed(1))
      : 0;

    // Merged Daily Time-series
    const dailyMap = new Map();
    ga4Current.forEach((r) => {
      dailyMap.set(r.date, {
        date: r.date,
        sessions: r.sessions,
        organicSessions: r.organicSessions,
        users: r.totalUsers,
        pageViews: r.screenPageViews,
        conversions: r.conversions,
        clicks: 0,
        impressions: 0,
      });
    });

    gscCurrent.forEach((r) => {
      const entry = dailyMap.get(r.date) || {
        date: r.date,
        sessions: 0,
        organicSessions: 0,
        users: 0,
        pageViews: 0,
        conversions: 0,
      };
      entry.clicks = r.clicks;
      entry.impressions = r.impressions;
      entry.ctr = r.ctr;
      entry.position = r.avgPosition;
      dailyMap.set(r.date, entry);
    });

    const timeSeries = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      websiteId,
      domain: website.domain,
      client: website.client,
      dateRange: dateRanges.current,
      comparisonRange: compare ? dateRanges.previous : null,
      ga4Summary: {
        sessions: currGA4Totals.sessions,
        totalSessions: currGA4Totals.sessions,
        organicSessions: currGA4Totals.organicSessions,
        totalUsers: currGA4Totals.users,
        conversions: currGA4Totals.conversions,
        screenPageViews: currGA4Totals.screenPageViews,
        comparison: {
          totalSessions: prevGA4Totals.sessions,
          organicSessions: prevGA4Totals.organicSessions,
          totalUsers: prevGA4Totals.users,
          conversions: prevGA4Totals.conversions,
          deltas: {
            sessions: calculateComparisonMetric(currGA4Totals.sessions, prevGA4Totals.sessions),
            organicSessions: calculateComparisonMetric(currGA4Totals.organicSessions, prevGA4Totals.organicSessions),
            users: calculateComparisonMetric(currGA4Totals.users, prevGA4Totals.users),
            conversions: calculateComparisonMetric(currGA4Totals.conversions, prevGA4Totals.conversions),
          },
        },
      },
      gscSummary: {
        clicks: currGSCTotals.clicks,
        totalClicks: currGSCTotals.clicks,
        impressions: currGSCTotals.impressions,
        totalImpressions: currGSCTotals.impressions,
        averageCtr: parseFloat(currCTR.toFixed(2)),
        averagePosition: parseFloat(currPos.toFixed(1)),
        comparison: {
          totalClicks: prevGSCTotals.clicks,
          totalImpressions: prevGSCTotals.impressions,
          averageCtr: parseFloat(prevCTR.toFixed(2)),
          averagePosition: parseFloat(prevPos.toFixed(1)),
          deltas: {
            clicks: calculateComparisonMetric(currGSCTotals.clicks, prevGSCTotals.clicks),
            impressions: calculateComparisonMetric(currGSCTotals.impressions, prevGSCTotals.impressions),
            ctr: calculateComparisonMetric(parseFloat(currCTR.toFixed(2)), parseFloat(prevCTR.toFixed(2))),
            position: calculateComparisonMetric(parseFloat(currPos.toFixed(1)), parseFloat(prevPos.toFixed(1)), {
              inverseTrend: true,
            }),
          },
        },
      },
      claritySummary: {
        sessions: clarityTotals.sessions,
        totalSessions: clarityTotals.sessions,
        deadClicks: clarityTotals.deadClicks,
        rageClicks: clarityTotals.rageClicks,
        quickbacks: clarityTotals.quickbacks,
        excessiveScroll: clarityTotals.excessiveScrolls,
        scriptErrors: clarityTotals.scriptErrors,
        frictionRate,
        totalFrictionEvents,
      },
      kpis: {
        // GA4
        sessions: calculateComparisonMetric(currGA4Totals.sessions, prevGA4Totals.sessions),
        organicSessions: calculateComparisonMetric(currGA4Totals.organicSessions, prevGA4Totals.organicSessions),
        users: calculateComparisonMetric(currGA4Totals.users, prevGA4Totals.users),
        pageViews: calculateComparisonMetric(currGA4Totals.screenPageViews, prevGA4Totals.screenPageViews),
        conversions: calculateComparisonMetric(currGA4Totals.conversions, prevGA4Totals.conversions),
        // GSC
        clicks: calculateComparisonMetric(currGSCTotals.clicks, prevGSCTotals.clicks),
        impressions: calculateComparisonMetric(currGSCTotals.impressions, prevGSCTotals.impressions),
        ctr: calculateComparisonMetric(parseFloat(currCTR.toFixed(2)), parseFloat(prevCTR.toFixed(2))),
        avgPosition: calculateComparisonMetric(
          parseFloat(currPos.toFixed(1)),
          parseFloat(prevPos.toFixed(1)),
          { inverseTrend: true }
        ),
        // Clarity (shown with note on rolling window)
        claritySessions: clarityTotals.sessions,
        frictionRate,
        totalFrictionEvents,
      },
      providers: {
        ga4: {
          connected: Boolean(
            website.integrations?.some((i) => i.integrationType === 'GA4' && i.status === 'CONNECTED')
          ),
        },
        gsc: {
          connected: Boolean(
            website.integrations?.some((i) => i.integrationType === 'GSC' && i.status === 'CONNECTED')
          ),
        },
        clarity: {
          connected: Boolean(
            website.integrations?.some((i) => i.integrationType === 'CLARITY' && i.status === 'CONNECTED')
          ),
        },
      },
      timeSeries,
      integrations: website.integrations,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. GA4 DEEP-DIVE ANALYTICS
  // ───────────────────────────────────────────────────────────────────────────
  async getGA4Summary(workspaceId, websiteId, { startDate, endDate, compare = false } = {}) {
    await this.verifyWebsite(workspaceId, websiteId);

    const start = startDate || getDaysAgoDate(28);
    const end = endDate || getDaysAgoDate(1);
    const dateRanges = getComparisonDateRanges(start, end);

    const [currentRecords, previousRecords] = await Promise.all([
      prisma.gA4DailyMetric.findMany({
        where: { websiteId, date: { gte: dateRanges.current.startDate, lte: dateRanges.current.endDate } },
        orderBy: { date: 'asc' },
      }),
      compare
        ? prisma.gA4DailyMetric.findMany({
            where: { websiteId, date: { gte: dateRanges.previous.startDate, lte: dateRanges.previous.endDate } },
          })
        : Promise.resolve([]),
    ]);

    const aggregateGA4 = (records) => {
      const totals = records.reduce(
        (acc, r) => {
          acc.sessions += r.sessions;
          acc.organicSessions += r.organicSessions;
          acc.totalUsers += r.totalUsers;
          acc.newUsers += r.newUsers;
          acc.activeUsers += r.activeUsers;
          acc.engagedSessions += r.engagedSessions;
          acc.engagementSec += r.avgEngagementTimeSec * r.sessions;
          acc.conversions += r.conversions;
          acc.screenPageViews += r.screenPageViews;
          acc.bounceSessions += (r.bounceRate * r.sessions);
          return acc;
        },
        {
          sessions: 0,
          organicSessions: 0,
          totalUsers: 0,
          newUsers: 0,
          activeUsers: 0,
          engagedSessions: 0,
          engagementSec: 0,
          conversions: 0,
          screenPageViews: 0,
          bounceSessions: 0,
        }
      );

      const engagementRate = totals.sessions > 0 ? (totals.engagedSessions / totals.sessions) * 100 : 0;
      const avgEngagementTime = totals.sessions > 0 ? totals.engagementSec / totals.sessions : 0;
      const bounceRate = totals.sessions > 0 ? (totals.bounceSessions / totals.sessions) : 0;

      return {
        ...totals,
        engagementRate: parseFloat(engagementRate.toFixed(1)),
        avgEngagementTime: Math.round(avgEngagementTime),
        bounceRate: parseFloat((bounceRate * 100).toFixed(1)),
      };
    };

    const curr = aggregateGA4(currentRecords);
    const prev = aggregateGA4(previousRecords);

    return {
      dateRange: dateRanges.current,
      comparisonRange: compare ? dateRanges.previous : null,
      summary: {
        totalUsers: calculateComparisonMetric(curr.totalUsers, prev.totalUsers),
        activeUsers: calculateComparisonMetric(curr.activeUsers, prev.activeUsers),
        newUsers: calculateComparisonMetric(curr.newUsers, prev.newUsers),
        sessions: calculateComparisonMetric(curr.sessions, prev.sessions),
        organicSessions: calculateComparisonMetric(curr.organicSessions, prev.organicSessions),
        engagedSessions: calculateComparisonMetric(curr.engagedSessions, prev.engagedSessions),
        engagementRate: calculateComparisonMetric(curr.engagementRate, prev.engagementRate),
        avgEngagementTime: calculateComparisonMetric(curr.avgEngagementTime, prev.avgEngagementTime),
        bounceRate: calculateComparisonMetric(curr.bounceRate, prev.bounceRate, { inverseTrend: true }),
        screenPageViews: calculateComparisonMetric(curr.screenPageViews, prev.screenPageViews),
        conversions: calculateComparisonMetric(curr.conversions, prev.conversions),
      },
      trends: currentRecords.map((r) => ({
        date: r.date,
        totalUsers: r.totalUsers,
        activeUsers: r.activeUsers,
        sessions: r.sessions,
        organicSessions: r.organicSessions,
        engagedSessions: r.engagedSessions,
        screenPageViews: r.screenPageViews,
        conversions: r.conversions,
      })),
    };
  }

  async getGA4TrafficSources(workspaceId, websiteId, { startDate, endDate, limit = 20 } = {}) {
    await this.verifyWebsite(workspaceId, websiteId);
    const start = startDate || getDaysAgoDate(28);
    const end = endDate || getDaysAgoDate(1);

    const records = await prisma.gA4TrafficSourceMetric.findMany({
      where: { websiteId, date: { gte: start, lte: end } },
    });

    const sourceMap = new Map();
    for (const r of records) {
      const key = `${r.source} / ${r.medium}`;
      const existing = sourceMap.get(key) || {
        channel: key,
        source: r.source,
        medium: r.medium,
        sessions: 0,
        organicSessions: 0,
        users: 0,
        conversions: 0,
        engagedSessions: 0,
      };
      existing.sessions += r.sessions;
      existing.organicSessions += r.organicSessions;
      existing.users += r.users;
      existing.conversions += r.conversions;
      existing.engagedSessions += r.engagedSessions;
      sourceMap.set(key, existing);
    }

    const sources = Array.from(sourceMap.values())
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, Number(limit));

    return {
      startDate: start,
      endDate: end,
      totalChannels: sourceMap.size,
      sources,
    };
  }

  async getGA4LandingPages(workspaceId, websiteId, { startDate, endDate, limit = 20, offset = 0, search } = {}) {
    await this.verifyWebsite(workspaceId, websiteId);
    const start = startDate || getDaysAgoDate(28);
    const end = endDate || getDaysAgoDate(1);

    const where = {
      websiteId,
      date: { gte: start, lte: end },
      ...(search ? { landingPage: { contains: search } } : {}),
    };

    const records = await prisma.gA4LandingPageMetric.findMany({ where });

    const pageMap = new Map();
    for (const r of records) {
      const existing = pageMap.get(r.landingPage) || {
        landingPage: r.landingPage,
        sessions: 0,
        organicSessions: 0,
        users: 0,
        conversions: 0,
        engagedSessions: 0,
        screenPageViews: 0,
      };
      existing.sessions += r.sessions;
      existing.organicSessions += r.organicSessions;
      existing.users += r.users;
      existing.conversions += r.conversions;
      existing.engagedSessions += r.engagedSessions;
      existing.screenPageViews += r.screenPageViews;
      pageMap.set(r.landingPage, existing);
    }

    const allPages = Array.from(pageMap.values())
      .map((p) => ({
        ...p,
        engagementRate: p.sessions > 0 ? parseFloat(((p.engagedSessions / p.sessions) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    const paginated = allPages.slice(Number(offset), Number(offset) + Number(limit));

    return {
      startDate: start,
      endDate: end,
      total: allPages.length,
      limit: Number(limit),
      offset: Number(offset),
      landingPages: paginated,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. GSC DEEP-DIVE ANALYTICS
  // ───────────────────────────────────────────────────────────────────────────
  async getGSCSummary(workspaceId, websiteId, { startDate, endDate, compare = false } = {}) {
    await this.verifyWebsite(workspaceId, websiteId);

    const start = startDate || getDaysAgoDate(28);
    const end = endDate || getDaysAgoDate(3); // GSC latency 2-3 days
    const dateRanges = getComparisonDateRanges(start, end);

    const [currentRecords, previousRecords] = await Promise.all([
      prisma.gSCDailyMetric.findMany({
        where: { websiteId, date: { gte: dateRanges.current.startDate, lte: dateRanges.current.endDate } },
        orderBy: { date: 'asc' },
      }),
      compare
        ? prisma.gSCDailyMetric.findMany({
            where: { websiteId, date: { gte: dateRanges.previous.startDate, lte: dateRanges.previous.endDate } },
          })
        : Promise.resolve([]),
    ]);

    const aggregateGSC = (records) => {
      const totals = records.reduce(
        (acc, r) => {
          acc.clicks += r.clicks;
          acc.impressions += r.impressions;
          acc.posWeight += r.avgPosition * r.impressions;
          return acc;
        },
        { clicks: 0, impressions: 0, posWeight: 0 }
      );

      const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
      const avgPosition = totals.impressions > 0 ? totals.posWeight / totals.impressions : 0;

      return {
        clicks: totals.clicks,
        impressions: totals.impressions,
        ctr: parseFloat(ctr.toFixed(2)),
        avgPosition: parseFloat(avgPosition.toFixed(1)),
      };
    };

    const curr = aggregateGSC(currentRecords);
    const prev = aggregateGSC(previousRecords);

    return {
      dateRange: dateRanges.current,
      comparisonRange: compare ? dateRanges.previous : null,
      summary: {
        clicks: calculateComparisonMetric(curr.clicks, prev.clicks),
        impressions: calculateComparisonMetric(curr.impressions, prev.impressions),
        ctr: calculateComparisonMetric(curr.ctr, prev.ctr),
        avgPosition: calculateComparisonMetric(curr.avgPosition, prev.avgPosition, { inverseTrend: true }),
      },
      trends: currentRecords.map((r) => ({
        date: r.date,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        avgPosition: r.avgPosition,
      })),
    };
  }

  async getGSCTopQueries(workspaceId, websiteId, { startDate, endDate, limit = 50, offset = 0, search, minClicks = 0, minImpressions = 0 } = {}) {
    await this.verifyWebsite(workspaceId, websiteId);
    const start = startDate || getDaysAgoDate(28);
    const end = endDate || getDaysAgoDate(3);

    const where = {
      websiteId,
      date: { gte: start, lte: end },
      ...(search ? { query: { contains: search } } : {}),
    };

    const records = await prisma.gSCQueryMetric.findMany({ where });

    const queryMap = new Map();
    for (const r of records) {
      const existing = queryMap.get(r.query) || {
        query: r.query,
        clicks: 0,
        impressions: 0,
        posWeight: 0,
      };
      existing.clicks += r.clicks;
      existing.impressions += r.impressions;
      existing.posWeight += r.avgPosition * r.impressions;
      queryMap.set(r.query, existing);
    }

    const filtered = Array.from(queryMap.values())
      .filter((q) => q.clicks >= Number(minClicks) && q.impressions >= Number(minImpressions))
      .map((q) => ({
        query: q.query,
        clicks: q.clicks,
        impressions: q.impressions,
        ctr: q.impressions > 0 ? parseFloat(((q.clicks / q.impressions) * 100).toFixed(2)) : 0,
        avgPosition: q.impressions > 0 ? parseFloat((q.posWeight / q.impressions).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks);

    const paginated = filtered.slice(Number(offset), Number(offset) + Number(limit));

    return {
      startDate: start,
      endDate: end,
      total: filtered.length,
      limit: Number(limit),
      offset: Number(offset),
      queries: paginated,
    };
  }

  async getGSCTopPages(workspaceId, websiteId, { startDate, endDate, limit = 50, offset = 0, search } = {}) {
    await this.verifyWebsite(workspaceId, websiteId);
    const start = startDate || getDaysAgoDate(28);
    const end = endDate || getDaysAgoDate(3);

    const where = {
      websiteId,
      date: { gte: start, lte: end },
      ...(search ? { page: { contains: search } } : {}),
    };

    const records = await prisma.gSCPageMetric.findMany({ where });

    const pageMap = new Map();
    for (const r of records) {
      const existing = pageMap.get(r.page) || {
        page: r.page,
        clicks: 0,
        impressions: 0,
        posWeight: 0,
      };
      existing.clicks += r.clicks;
      existing.impressions += r.impressions;
      existing.posWeight += r.avgPosition * r.impressions;
      pageMap.set(r.page, existing);
    }

    const filtered = Array.from(pageMap.values())
      .map((p) => ({
        page: p.page,
        clicks: p.clicks,
        impressions: p.impressions,
        ctr: p.impressions > 0 ? parseFloat(((p.clicks / p.impressions) * 100).toFixed(2)) : 0,
        avgPosition: p.impressions > 0 ? parseFloat((p.posWeight / p.impressions).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks);

    const paginated = filtered.slice(Number(offset), Number(offset) + Number(limit));

    return {
      startDate: start,
      endDate: end,
      total: filtered.length,
      limit: Number(limit),
      offset: Number(offset),
      pages: paginated,
    };
  }

  async getGSCBreakdown(workspaceId, websiteId, { dimension = 'device', startDate, endDate } = {}) {
    await this.verifyWebsite(workspaceId, websiteId);
    const start = startDate || getDaysAgoDate(28);
    const end = endDate || getDaysAgoDate(3);

    if (dimension === 'device') {
      const records = await prisma.gSCDeviceMetric.findMany({
        where: { websiteId, date: { gte: start, lte: end } },
      });
      const map = new Map();
      records.forEach((r) => {
        const item = map.get(r.device) || { name: r.device, clicks: 0, impressions: 0 };
        item.clicks += r.clicks;
        item.impressions += r.impressions;
        map.set(r.device, item);
      });
      return Array.from(map.values()).sort((a, b) => b.clicks - a.clicks);
    }

    // Country breakdown
    const records = await prisma.gSCCountryMetric.findMany({
      where: { websiteId, date: { gte: start, lte: end } },
    });
    const map = new Map();
    records.forEach((r) => {
      const item = map.get(r.country) || { name: r.country, clicks: 0, impressions: 0 };
      item.clicks += r.clicks;
      item.impressions += r.impressions;
      map.set(r.country, item);
    });
    return Array.from(map.values()).sort((a, b) => b.clicks - a.clicks).slice(0, 20);
  }

  async getGSCOpportunities(workspaceId, websiteId, { startDate, endDate } = {}) {
    await this.verifyWebsite(workspaceId, websiteId);
    const start = startDate || getDaysAgoDate(28);
    const end = endDate || getDaysAgoDate(3);

    const records = await prisma.gSCQueryMetric.findMany({
      where: { websiteId, date: { gte: start, lte: end } },
    });

    const queryMap = new Map();
    for (const r of records) {
      const existing = queryMap.get(r.query) || { query: r.query, clicks: 0, impressions: 0, posWeight: 0 };
      existing.clicks += r.clicks;
      existing.impressions += r.impressions;
      existing.posWeight += r.avgPosition * r.impressions;
      queryMap.set(r.query, existing);
    }

    const queries = Array.from(queryMap.values()).map((q) => ({
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.impressions > 0 ? (q.clicks / q.impressions) * 100 : 0,
      avgPosition: q.impressions > 0 ? q.posWeight / q.impressions : 0,
    }));

    // 1. High Impression, Low CTR (< 2.0%, impressions >= 100)
    const lowCtrOpportunities = queries
      .filter((q) => q.impressions >= 100 && q.ctr < 2.0)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    // 2. Striking Distance (Position between 4.0 and 15.0 with good impressions)
    const strikingDistance = queries
      .filter((q) => q.avgPosition >= 4.0 && q.avgPosition <= 15.0 && q.impressions >= 50)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    return {
      lowCtrOpportunities,
      strikingDistance,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. CLARITY BEHAVIORAL DASHBOARD
  // ───────────────────────────────────────────────────────────────────────────
  async getClaritySummary(workspaceId, websiteId) {
    const website = await this.verifyWebsite(workspaceId, websiteId);

    const [dailyMetrics, topPages, deviceBreakdown, latestSnapshot] = await Promise.all([
      prisma.clarityDailyMetric.findMany({
        where: { websiteId },
        orderBy: { date: 'desc' },
        take: 3, // Clarity provides rolling 1-3 days
      }),
      prisma.clarityPageMetric.findMany({
        where: { websiteId },
        orderBy: { rageClicks: 'desc' },
        take: 15,
      }),
      prisma.clarityDeviceMetric.findMany({
        where: { websiteId },
        orderBy: { sessions: 'desc' },
        take: 10,
      }),
      prisma.clarityImportSnapshot.findFirst({
        where: { websiteId, workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totals = dailyMetrics.reduce(
      (acc, r) => {
        acc.sessions += r.sessions;
        acc.distinctUsers += r.distinctUsers;
        acc.botSessions += r.botSessions;
        acc.rageClickCount += r.rageClickCount;
        acc.deadClickCount += r.deadClickCount;
        acc.excessiveScrollCount += r.excessiveScrollCount;
        acc.quickbackClickCount += r.quickbackClickCount;
        acc.scriptErrorCount += r.scriptErrorCount;
        acc.scrollDepthWeight += r.avgScrollDepth * r.sessions;
        acc.activeTimeWeight += r.avgTimeOnPageSec * r.sessions;
        return acc;
      },
      {
        sessions: 0,
        distinctUsers: 0,
        botSessions: 0,
        rageClickCount: 0,
        deadClickCount: 0,
        excessiveScrollCount: 0,
        quickbackClickCount: 0,
        scriptErrorCount: 0,
        scrollDepthWeight: 0,
        activeTimeWeight: 0,
      }
    );

    const avgScrollDepth = totals.sessions > 0 ? parseFloat((totals.scrollDepthWeight / totals.sessions).toFixed(1)) : 0;
    const avgTimeOnPageSec = totals.sessions > 0 ? Math.round(totals.activeTimeWeight / totals.sessions) : 0;

    const rageClickRate = totals.sessions > 0 ? parseFloat(((totals.rageClickCount / totals.sessions) * 100).toFixed(1)) : 0;
    const deadClickRate = totals.sessions > 0 ? parseFloat(((totals.deadClickCount / totals.sessions) * 100).toFixed(1)) : 0;
    const quickbackRate = totals.sessions > 0 ? parseFloat(((totals.quickbackClickCount / totals.sessions) * 100).toFixed(1)) : 0;
    const scriptErrorRate = totals.sessions > 0 ? parseFloat(((totals.scriptErrorCount / totals.sessions) * 100).toFixed(1)) : 0;

    const clarityConn = website.integrations.find((i) => i.integrationType === 'CLARITY')?.clarityConnection;
    const quotaIsCurrent = clarityConn?.apiCallsResetAt &&
      new Date(clarityConn.apiCallsResetAt) >= new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

    return {
      reportingWindow: latestSnapshot
        ? {
            days: latestSnapshot.requestedNumOfDays,
            windowStart: latestSnapshot.windowStart,
            windowEnd: latestSnapshot.windowEnd,
            lastImportAt: latestSnapshot.createdAt,
            preset: latestSnapshot.preset,
          }
        : null,
      quota: clarityConn
        ? {
            callsToday: quotaIsCurrent ? clarityConn.apiCallsToday : 0,
            callsRemaining: Math.max(0, 10 - (quotaIsCurrent ? clarityConn.apiCallsToday : 0)),
            limit: 10,
          }
        : null,
      friction: {
        totalSessions: totals.sessions,
        distinctUsers: totals.distinctUsers,
        rageClickCount: totals.rageClickCount,
        rageClickRate,
        deadClickCount: totals.deadClickCount,
        deadClickRate,
        quickbackClickCount: totals.quickbackClickCount,
        quickbackRate,
        excessiveScrollCount: totals.excessiveScrollCount,
        scriptErrorCount: totals.scriptErrorCount,
        scriptErrorRate,
        avgScrollDepth,
        avgTimeOnPageSec,
      },
      topPages,
      deviceBreakdown,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. AGENCY & MULTI-WEBSITE OVERVIEW
  // ───────────────────────────────────────────────────────────────────────────
  async getAgencyOverview(workspaceId) {
    const clients = await prisma.client.findMany({
      where: { workspaceId, status: 'ACTIVE' },
      include: {
        websites: {
          where: { status: 'ACTIVE' },
          include: {
            integrations: {
              select: {
                integrationType: true,
                status: true,
                lastSyncAt: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const thirtyDaysAgo = getDaysAgoDate(30);

    const clientOverviews = await Promise.all(
      clients.map(async (client) => {
        const websitesData = await Promise.all(
          client.websites.map(async (web) => {
            const [gscRecent, ga4Recent] = await Promise.all([
              prisma.gSCDailyMetric.findMany({
                where: { websiteId: web.id, date: { gte: thirtyDaysAgo } },
              }),
              prisma.gA4DailyMetric.findMany({
                where: { websiteId: web.id, date: { gte: thirtyDaysAgo } },
              }),
            ]);

            const clicks = gscRecent.reduce((sum, r) => sum + r.clicks, 0);
            const impressions = gscRecent.reduce((sum, r) => sum + r.impressions, 0);
            const sessions = ga4Recent.reduce((sum, r) => sum + r.sessions, 0);
            const users = ga4Recent.reduce((sum, r) => sum + r.totalUsers, 0);

            return {
              id: web.id,
              domain: web.domain,
              name: web.name,
              clicks,
              impressions,
              sessions,
              users,
              integrations: web.integrations,
            };
          })
        );

        return {
          id: client.id,
          name: client.name,
          websitesCount: client.websites.length,
          websites: websitesData,
        };
      })
    );

    return {
      workspaceId,
      totalClients: clients.length,
      clients: clientOverviews,
    };
  }
}

export const analyticsDataService = new AnalyticsDataService();
export default analyticsDataService;
