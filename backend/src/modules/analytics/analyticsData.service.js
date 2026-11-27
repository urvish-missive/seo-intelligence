// backend/src/modules/analytics/analyticsData.service.js
// Production Analytics Service for GA4, GSC, Clarity, Multi-Website, and Cross-Platform intelligence.
// 100% offline querying against local MySQL with weighted statistical aggregations and period comparisons.

import prisma from '../../config/database.js';
import { NotFoundError, BadRequestError } from '../../middleware/errorHandler.js';
import { getComparisonDateRanges, calculateComparisonMetric } from '../../utils/analyticsDate.utils.js';
import { summariseOverview } from '../integrations/clarity/clarityImport.service.js';
import { getEffectiveCallsToday } from '../integrations/clarity/clarityConnection.service.js';
import { clarityCsvService } from '../integrations/clarity/clarityCsv.service.js';

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
      this.getClarityWindowTotals(workspaceId, websiteId, {
        startDate: dateRanges.current.startDate,
        endDate: dateRanges.current.endDate,
      }).catch(() => null),
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

    // Clarity imports that cover this period (non-overlapping windows)
    const clarityTotals = {
      sessions: clarityDaily?.sessions || 0,
      rageClicks: clarityDaily?.rageClickCount || 0,
      deadClicks: clarityDaily?.deadClickCount || 0,
      quickbacks: clarityDaily?.quickbackClickCount || 0,
      excessiveScrolls: clarityDaily?.excessiveScrollCount || 0,
      scriptErrors: clarityDaily?.scriptErrorCount || 0,
    };

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
            website.integrations?.some((i) => i.integrationType === 'GA4' && ['CONNECTED', 'SYNCING'].includes(i.status))
          ),
        },
        gsc: {
          connected: Boolean(
            website.integrations?.some((i) => i.integrationType === 'GSC' && ['CONNECTED', 'SYNCING'].includes(i.status))
          ),
        },
        clarity: {
          connected: Boolean(
            website.integrations?.some((i) => i.integrationType === 'CLARITY' && ['CONNECTED', 'SYNCING'].includes(i.status))
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
        position: q.impressions > 0 ? parseFloat((q.posWeight / q.impressions).toFixed(1)) : 0,
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
        position: p.impressions > 0 ? parseFloat((p.posWeight / p.impressions).toFixed(1)) : 0,
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
  /**
   * Clarity totals for a date range, built from the stored import snapshots.
   *
   * Every Clarity import covers a rolling window (the last 1-3 days before the
   * import ran), so it must be matched to a period by its real window, not by
   * the day it was imported. Windows that overlap the period are taken newest
   * first, skipping any that overlap a window already used, so no visit is
   * counted twice. Without a range, the latest import is used.
   */
  async getClarityWindowTotals(workspaceId, websiteId, { startDate, endDate } = {}) {
    const hasRange = Boolean(startDate && endDate);
    const where = {
      websiteId,
      workspaceId,
      preset: 'OVERVIEW',
      status: 'COMPLETED',
      windowStart: { not: null },
      windowEnd: { not: null },
    };
    if (hasRange) {
      const rangeStart = new Date(`${startDate}T00:00:00.000Z`);
      const rangeEndExclusive = new Date(new Date(`${endDate}T00:00:00.000Z`).getTime() + 86400000);
      where.windowStart = { lt: rangeEndExclusive };
      where.windowEnd = { gt: rangeStart };
    }

    const candidates = await prisma.clarityImportSnapshot.findMany({
      where,
      orderBy: { windowEnd: 'desc' },
      take: hasRange ? 200 : 5,
      select: { id: true, windowStart: true, windowEnd: true, requestedNumOfDays: true, createdAt: true, rawResponseJson: true },
    });

    // Whole months imported from Clarity dashboard CSVs take priority over the
    // 1–3 day API windows for the days they cover.
    const csvMonths = hasRange ? await clarityCsvService.importsWithinRange(websiteId, startDate, endDate).catch(() => []) : [];
    const csvSpans = csvMonths.map((m) => [
      new Date(`${m.from}T00:00:00.000Z`).getTime(),
      new Date(`${m.to}T23:59:59.999Z`).getTime(),
    ]);
    const midpointInCsvMonth = (snap) => {
      const mid = (new Date(snap.windowStart).getTime() + new Date(snap.windowEnd).getTime()) / 2;
      return csvSpans.some(([a, b]) => mid >= a && mid <= b);
    };

    const TOLERANCE_MS = 2 * 60 * 60 * 1000; // imports a little apart still count as back-to-back
    const chosen = [];
    let earliestStart = Infinity;
    for (const snap of candidates) {
      if (midpointInCsvMonth(snap)) continue;
      let raw;
      try {
        raw = JSON.parse(snap.rawResponseJson);
      } catch {
        continue;
      }
      if (!Array.isArray(raw) || raw.length === 0) continue;
      const start = new Date(snap.windowStart).getTime();
      const end = new Date(snap.windowEnd).getTime();
      if (end > earliestStart + TOLERANCE_MS) continue; // overlaps a newer window already used
      chosen.push({ snap, summary: summariseOverview(raw) });
      earliestStart = start;
      if (!hasRange) break;
    }

    const totals = {
      sessions: 0, botSessions: 0, distinctUsers: 0,
      rageClickCount: 0, deadClickCount: 0, excessiveScrollCount: 0,
      quickbackClickCount: 0, scriptErrorCount: 0, errorClickCount: 0,
      ppsWeight: 0, scrollWeight: 0, activeWeight: 0, totalTimeWeight: 0,
    };
    const pages = new Map();
    const devices = new Map();
    const countries = new Map();
    const addTo = (map, items) => items.forEach(({ key, sessions }) => map.set(key, (map.get(key) || 0) + sessions));

    for (const { summary: s } of chosen) {
      totals.sessions += s.sessions;
      totals.botSessions += s.botSessions;
      totals.distinctUsers += s.distinctUsers;
      totals.rageClickCount += s.rageClickCount;
      totals.deadClickCount += s.deadClickCount;
      totals.excessiveScrollCount += s.excessiveScrollCount;
      totals.quickbackClickCount += s.quickbackClickCount;
      totals.scriptErrorCount += s.scriptErrorCount;
      totals.errorClickCount += s.errorClickCount;
      totals.ppsWeight += s.pagesPerSession * s.sessions;
      totals.scrollWeight += s.avgScrollDepth * s.sessions;
      totals.activeWeight += s.avgTimeOnPageSec * s.sessions;
      totals.totalTimeWeight += s.totalTimeSec * s.sessions;
      addTo(pages, s.pages);
      addTo(devices, s.devices);
      addTo(countries, s.countries);
    }

    for (const m of csvMonths) {
      const x = m.metrics;
      const sess = x.sessions || 0;
      totals.sessions += sess;
      totals.botSessions += x.botSessions || 0;
      totals.distinctUsers += x.distinctUsers || 0;
      totals.rageClickCount += x.rageClickCount || 0;
      totals.deadClickCount += x.deadClickCount || 0;
      totals.excessiveScrollCount += x.excessiveScrollCount || 0;
      totals.quickbackClickCount += x.quickbackClickCount || 0;
      totals.scriptErrorCount += x.scriptErrorCount || 0;
      totals.errorClickCount += x.errorClickCount || 0;
      totals.ppsWeight += (x.pagesPerSession || 0) * sess;
      totals.scrollWeight += (x.avgScrollDepth || 0) * sess;
      totals.activeWeight += (x.avgTimeOnPageSec || 0) * sess;
      totals.totalTimeWeight += (m.extras.totalTimeSec || 0) * sess;
      const asItems = (list) => list.map((i) => ({ key: i.name, sessions: i.sessions || 0 }));
      addTo(pages, asItems(m.pages));
      addTo(devices, asItems(m.devices));
      addTo(countries, asItems(m.countries));
    }

    const per = (w) => (totals.sessions > 0 ? w / totals.sessions : 0);
    const windows = chosen
      .map(({ snap, summary }) => ({
        start: snap.windowStart,
        end: snap.windowEnd,
        days: snap.requestedNumOfDays,
        importedAt: snap.createdAt,
        sessions: summary.sessions,
        rageClickCount: summary.rageClickCount,
        deadClickCount: summary.deadClickCount,
        quickbackClickCount: summary.quickbackClickCount,
      }))
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    const sorted = (map, keyName) =>
      Array.from(map.entries())
        .map(([key, sessions]) => ({ [keyName]: key, sessions }))
        .sort((a, b) => b.sessions - a.sessions);

    return {
      sessions: totals.sessions,
      botSessions: totals.botSessions,
      distinctUsers: totals.distinctUsers,
      rageClickCount: totals.rageClickCount,
      deadClickCount: totals.deadClickCount,
      excessiveScrollCount: totals.excessiveScrollCount,
      quickbackClickCount: totals.quickbackClickCount,
      scriptErrorCount: totals.scriptErrorCount,
      errorClickCount: totals.errorClickCount,
      pagesPerSession: parseFloat(per(totals.ppsWeight).toFixed(2)),
      avgScrollDepth: parseFloat(per(totals.scrollWeight).toFixed(2)),
      avgTimeOnPageSec: Math.round(per(totals.activeWeight)),
      totalTimeSec: Math.round(per(totals.totalTimeWeight)),
      pages: sorted(pages, 'page'),
      devices: sorted(devices, 'device'),
      countries: sorted(countries, 'country'),
      windows,
      csvMonths: csvMonths.map((m) => ({ month: m.month, from: m.from, to: m.to, partial: m.partialMonth, sessions: m.metrics.sessions || 0 })),
      coverage:
        windows.length || csvMonths.length
          ? {
              from: [...windows.map((w) => new Date(w.start)), ...csvMonths.map((m) => new Date(`${m.from}T00:00:00.000Z`))].sort((a, b) => a - b)[0],
              to: [...windows.map((w) => new Date(w.end)), ...csvMonths.map((m) => new Date(`${m.to}T23:59:59.999Z`))].sort((a, b) => b - a)[0],
              imports: windows.length,
              csvMonths: csvMonths.map((m) => m.month),
            }
          : null,
    };
  }

  async getClaritySummary(workspaceId, websiteId, { startDate, endDate } = {}) {
    const website = await this.verifyWebsite(workspaceId, websiteId);
    const hasRange = Boolean(startDate && endDate);
    const t = await this.getClarityWindowTotals(workspaceId, websiteId, hasRange ? { startDate, endDate } : {});

    // Per-page friction comes from URL-preset imports stored in clarity_page_metrics
    let frictionRows = [];
    if (t.coverage) {
      const fromDate = new Date(t.coverage.from).toISOString().slice(0, 10);
      const toDate = new Date(t.coverage.to).toISOString().slice(0, 10);
      frictionRows = await prisma.clarityPageMetric.findMany({
        where: {
          websiteId,
          date: { gte: fromDate, lte: toDate },
          OR: [{ deadClicks: { gt: 0 } }, { rageClicks: { gt: 0 } }, { quickBacks: { gt: 0 } }],
        },
      });
    }
    const friction = new Map();
    for (const r of frictionRows) {
      const f = friction.get(r.page) || { deadClicks: 0, rageClicks: 0, quickBacks: 0, scrollW: 0, n: 0 };
      f.deadClicks += r.deadClicks;
      f.rageClicks += r.rageClicks;
      f.quickBacks += r.quickBacks;
      if (r.avgScrollDepth) {
        f.scrollW += r.avgScrollDepth;
        f.n += 1;
      }
      friction.set(r.page, f);
    }
    const sessionsByPage = new Map(t.pages.map((p) => [p.page, p.sessions]));
    const pageKeys = new Set([...sessionsByPage.keys(), ...friction.keys()]);
    const topPages = Array.from(pageKeys)
      .map((page) => {
        const f = friction.get(page) || {};
        return {
          page,
          sessions: sessionsByPage.get(page) || 0,
          deadClicks: f.deadClicks || 0,
          rageClicks: f.rageClicks || 0,
          quickBacks: f.quickBacks || 0,
          avgScrollDepth: f.n ? parseFloat((f.scrollW / f.n).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.rageClicks - a.rageClicks || b.deadClicks - a.deadClicks || b.sessions - a.sessions)
      .slice(0, 15);

    const rate = (n) => (t.sessions > 0 ? parseFloat(((n / t.sessions) * 100).toFixed(1)) : 0);
    const latest = t.windows[t.windows.length - 1];
    const clarityConn = website.integrations.find((i) => i.integrationType === 'CLARITY')?.clarityConnection;
    const callsToday = getEffectiveCallsToday(clarityConn);

    const csvDays = t.csvMonths.reduce(
      (acc, m) => acc + Math.round((Date.parse(m.to) - Date.parse(m.from)) / 86400000) + 1,
      0
    );
    return {
      reportingWindow:
        latest || t.csvMonths.length
          ? {
              days: (latest?.days || 0) + csvDays,
              windowStart: t.coverage.from,
              windowEnd: t.coverage.to,
              lastImportAt: latest?.importedAt || null,
              imports: t.windows.length,
              csvMonths: t.csvMonths.map((m) => m.month),
            }
          : null,
      coverage: t.coverage,
      windows: t.windows,
      csvMonths: t.csvMonths,
      quota: clarityConn ? { callsToday, callsRemaining: Math.max(0, 10 - callsToday), limit: 10 } : null,
      friction: {
        totalSessions: t.sessions,
        botSessions: t.botSessions,
        distinctUsers: t.distinctUsers,
        pagesPerSession: t.pagesPerSession,
        rageClickCount: t.rageClickCount,
        rageClickRate: rate(t.rageClickCount),
        deadClickCount: t.deadClickCount,
        deadClickRate: rate(t.deadClickCount),
        quickbackClickCount: t.quickbackClickCount,
        quickbackRate: rate(t.quickbackClickCount),
        excessiveScrollCount: t.excessiveScrollCount,
        scriptErrorCount: t.scriptErrorCount,
        scriptErrorRate: rate(t.scriptErrorCount),
        avgScrollDepth: t.avgScrollDepth,
        avgTimeOnPageSec: t.avgTimeOnPageSec,
        totalTimeSec: t.totalTimeSec,
      },
      topPages,
      deviceBreakdown: t.devices.slice(0, 10),
      countryBreakdown: t.countries.slice(0, 10),
      dateRange: hasRange ? { startDate, endDate } : null,
      daysWithData: t.windows.reduce((acc, w) => acc + (w.days || 0), 0) + csvDays,
      dailyTrend: t.windows.map((w) => ({
        date: new Date(w.end).toISOString().slice(0, 10),
        sessions: w.sessions,
        rageClickCount: w.rageClickCount,
        deadClickCount: w.deadClickCount,
        quickbackClickCount: w.quickbackClickCount,
      })),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. AGENCY & MULTI-WEBSITE OVERVIEW
  // ───────────────────────────────────────────────────────────────────────────
  async getAgencyOverview(workspaceId, { startDate, endDate } = {}) {
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

    const ranges = getComparisonDateRanges(startDate || getDaysAgoDate(30), endDate || getDaysAgoDate(1));
    const cur = { gte: ranges.current.startDate, lte: ranges.current.endDate };
    const prev = { gte: ranges.previous.startDate, lte: ranges.previous.endDate };
    const sum = (rows, key) => rows.reduce((acc, r) => acc + (r[key] || 0), 0);

    const clientOverviews = await Promise.all(
      clients.map(async (client) => {
        const websitesData = await Promise.all(
          client.websites.map(async (web) => {
            const [gscCur, ga4Cur, gscPrev, ga4Prev, clarityCur, ga4CountriesCur] = await Promise.all([
              prisma.gSCDailyMetric.findMany({ where: { websiteId: web.id, date: cur } }),
              prisma.gA4DailyMetric.findMany({ where: { websiteId: web.id, date: cur } }),
              prisma.gSCDailyMetric.findMany({ where: { websiteId: web.id, date: prev } }),
              prisma.gA4DailyMetric.findMany({ where: { websiteId: web.id, date: prev } }),
              this.getClarityWindowTotals(workspaceId, web.id, {
                startDate: ranges.current.startDate,
                endDate: ranges.current.endDate,
              }).catch(() => null),
              prisma.gA4CountryMetric.findMany({ where: { websiteId: web.id, date: cur } }),
            ]);

            const clicks = sum(gscCur, 'clicks');
            const impressions = sum(gscCur, 'impressions');
            const sessions = sum(ga4Cur, 'sessions');
            const organicSessions = sum(ga4Cur, 'organicSessions');
            const users = sum(ga4Cur, 'totalUsers');
            const posWeight = gscCur.reduce((acc, r) => acc + r.avgPosition * r.impressions, 0);
            const ctr = impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : 0;
            const avgPosition = impressions > 0 ? parseFloat((posWeight / impressions).toFixed(1)) : 0;
            const frictionEvents =
              (clarityCur?.rageClickCount || 0) + (clarityCur?.deadClickCount || 0) + (clarityCur?.quickbackClickCount || 0);
            const countrySessions = new Map();
            for (const row of ga4CountriesCur) {
              countrySessions.set(row.country, (countrySessions.get(row.country) || 0) + row.sessions);
            }
            const countryBreakdown = Array.from(countrySessions, ([country, countryCount]) => ({
              country,
              sessions: countryCount,
            })).sort((a, b) => b.sessions - a.sessions);
            const previous = {
              clicks: sum(gscPrev, 'clicks'),
              impressions: sum(gscPrev, 'impressions'),
              sessions: sum(ga4Prev, 'sessions'),
              organicSessions: sum(ga4Prev, 'organicSessions'),
              users: sum(ga4Prev, 'totalUsers'),
            };
            const changes = {
              clicks: calculateComparisonMetric(clicks, previous.clicks).percentChange,
              impressions: calculateComparisonMetric(impressions, previous.impressions).percentChange,
              sessions: calculateComparisonMetric(sessions, previous.sessions).percentChange,
              organicSessions: calculateComparisonMetric(organicSessions, previous.organicSessions).percentChange,
              users: calculateComparisonMetric(users, previous.users).percentChange,
            };
            const isLive = (type) =>
              web.integrations.some((i) => i.integrationType === type && ['CONNECTED', 'SYNCING'].includes(i.status));

            return {
              id: web.id,
              websiteId: web.id,
              domain: web.domain,
              name: web.name,
              websiteName: web.name,
              clientId: client.id,
              clientName: client.name,
              clicks,
              impressions,
              ctr,
              avgPosition,
              sessions,
              users,
              claritySessions: clarityCur?.sessions || 0,
              countryBreakdown,
              changes,
              previous,
              // Shape read by the agency overview table
              metrics: {
                gscClicks: clicks,
                gscImpressions: impressions,
                gscCtr: ctr,
                gscAvgPosition: avgPosition,
                ga4Sessions: sessions,
                ga4OrganicSessions: organicSessions,
                ga4Users: users,
                claritySessions: clarityCur?.sessions || 0,
                clarityFrustratedSessions: frictionEvents,
              },
              integrationDetails: web.integrations,
              integrations: { ga4: isLive('GA4'), gsc: isLive('GSC'), clarity: isLive('CLARITY') },
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

    const websites = clientOverviews.flatMap((c) => c.websites);

    return {
      workspaceId,
      dateRange: ranges.current,
      comparisonRange: ranges.previous,
      totalClients: clients.length,
      clients: clientOverviews,
      websites,
    };
  }
}

export const analyticsDataService = new AnalyticsDataService();
export default analyticsDataService;
