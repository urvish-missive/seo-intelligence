// backend/src/modules/analytics/monthlyChart.service.js
// Month-by-month series for the Charts page, one source at a time.
//
// GA4, GSC and Clarity identify visitors differently (GA4 cookie / client id,
// Clarity's own cookie, GSC has no users at all), so their counts are never
// summed together. Each request returns one source and one metric.
//
// Counts (sessions, clicks, impressions...) are summed from stored daily rows.
// Rates (CTR, engagement rate, position...) are re-weighted per month.
// User counts can't be summed from daily rows (a visitor on 5 days would count
// 5 times), so GA4 user metrics are fetched per month from the GA4 Data API
// and only fall back to "sum of daily users" when that call is not possible.

import prisma from '../../config/database.js';
import { BadRequestError, NotFoundError } from '../../middleware/errorHandler.js';
import GoogleClientFactory from '../integrations/google/googleClient.factory.js';
import logger from '../../utils/logger.js';
import { clarityCsvService } from '../integrations/clarity/clarityCsv.service.js';

// ─── Metric catalogue ──────────────────────────────────────────────────────
// agg: 'sum' adds daily values; 'weighted' averages them weighted by `weight`;
// 'ratio' divides two summed fields. `users: true` marks unique-user metrics.

const SOURCES = {
  ga4: {
    label: 'Google Analytics 4',
    segments: {
      none: {
        model: 'gA4DailyMetric',
        metrics: {
          totalUsers: { label: 'Users', agg: 'sum', field: 'totalUsers', users: true },
          newUsers: { label: 'New users', agg: 'sum', field: 'newUsers', users: true },
          activeUsers: { label: 'Active users', agg: 'sum', field: 'activeUsers', users: true },
          sessions: { label: 'Sessions', agg: 'sum', field: 'sessions' },
          organicSessions: { label: 'Organic sessions', agg: 'sum', field: 'organicSessions' },
          engagedSessions: { label: 'Engaged sessions', agg: 'sum', field: 'engagedSessions' },
          screenPageViews: { label: 'Page views', agg: 'sum', field: 'screenPageViews' },
          conversions: { label: 'Conversions', agg: 'sum', field: 'conversions' },
          engagementRate: { label: 'Engagement rate', agg: 'ratio', num: 'engagedSessions', den: 'sessions', unit: '%', scale: 100 },
          bounceRate: { label: 'Bounce rate', agg: 'weighted', field: 'bounceRate', weight: 'sessions', unit: '%', scale: 100 },
          avgEngagementTimeSec: { label: 'Avg. engagement time', agg: 'weighted', field: 'avgEngagementTimeSec', weight: 'sessions', unit: 's' },
        },
      },
      device: {
        model: 'gA4DeviceMetric',
        column: 'deviceCategory',
        ga4Dimension: 'deviceCategory',
        metrics: {
          totalUsers: { label: 'Users', agg: 'sum', field: 'users', users: true },
          sessions: { label: 'Sessions', agg: 'sum', field: 'sessions' },
          organicSessions: { label: 'Organic sessions', agg: 'sum', field: 'organicSessions' },
          conversions: { label: 'Conversions', agg: 'sum', field: 'conversions' },
          engagementRate: { label: 'Engagement rate', agg: 'weighted', field: 'engagementRate', weight: 'sessions', unit: '%', scale: 100 },
        },
      },
      country: {
        model: 'gA4CountryMetric',
        column: 'country',
        ga4Dimension: 'country',
        metrics: {
          totalUsers: { label: 'Users', agg: 'sum', field: 'users', users: true },
          sessions: { label: 'Sessions', agg: 'sum', field: 'sessions' },
          organicSessions: { label: 'Organic sessions', agg: 'sum', field: 'organicSessions' },
          conversions: { label: 'Conversions', agg: 'sum', field: 'conversions' },
        },
      },
      medium: {
        model: 'gA4TrafficSourceMetric',
        column: 'medium',
        ga4Dimension: 'sessionMedium',
        metrics: {
          totalUsers: { label: 'Users', agg: 'sum', field: 'users', users: true },
          newUsers: { label: 'New users', agg: 'sum', field: 'newUsers', users: true },
          sessions: { label: 'Sessions', agg: 'sum', field: 'sessions' },
          engagedSessions: { label: 'Engaged sessions', agg: 'sum', field: 'engagedSessions' },
          conversions: { label: 'Conversions', agg: 'sum', field: 'conversions' },
        },
      },
    },
  },
  gsc: {
    label: 'Google Search Console',
    segments: Object.fromEntries(
      [
        ['none', 'gSCDailyMetric', null],
        ['device', 'gSCDeviceMetric', 'device'],
        ['country', 'gSCCountryMetric', 'country'],
      ].map(([key, model, column]) => [
        key,
        {
          model,
          column,
          metrics: {
            clicks: { label: 'Clicks', agg: 'sum', field: 'clicks' },
            impressions: { label: 'Impressions', agg: 'sum', field: 'impressions' },
            ctr: { label: 'CTR', agg: 'ratio', num: 'clicks', den: 'impressions', unit: '%', scale: 100 },
            avgPosition: { label: 'Avg. position', agg: 'weighted', field: 'avgPosition', weight: 'impressions', lowerIsBetter: true },
          },
        },
      ])
    ),
  },
  clarity: {
    label: 'Microsoft Clarity',
    segments: {
      none: {
        model: 'clarityDailyMetric',
        metrics: {
          distinctUsers: { label: 'Users (Clarity)', agg: 'sum', field: 'distinctUsers', users: true },
          sessions: { label: 'Sessions', agg: 'sum', field: 'sessions' },
          botSessions: { label: 'Bot sessions', agg: 'sum', field: 'botSessions' },
          pagesPerSession: { label: 'Pages per session', agg: 'weighted', field: 'pagesPerSession', weight: 'sessions' },
          avgScrollDepth: { label: 'Avg. scroll depth', agg: 'weighted', field: 'avgScrollDepth', weight: 'sessions', unit: '%' },
          avgTimeOnPageSec: { label: 'Avg. time on page', agg: 'weighted', field: 'avgTimeOnPageSec', weight: 'sessions', unit: 's' },
          rageClickCount: { label: 'Rage clicks', agg: 'sum', field: 'rageClickCount', lowerIsBetter: true },
          deadClickCount: { label: 'Dead clicks', agg: 'sum', field: 'deadClickCount', lowerIsBetter: true },
          quickbackClickCount: { label: 'Quick-backs', agg: 'sum', field: 'quickbackClickCount', lowerIsBetter: true },
          scriptErrorCount: { label: 'Script errors', agg: 'sum', field: 'scriptErrorCount', lowerIsBetter: true },
        },
      },
    },
  },
};

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIVE_CACHE_TTL_MS = 60 * 60 * 1000;
const LIVE_TIMEOUT_MS = 8000;
const MAX_MONTHS = 120; // 10 years
const liveCache = new Map();

function pad(n) {
  return String(n).padStart(2, '0');
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Every YYYY-MM between two YYYY-MM-DD dates, inclusive. */
function monthsBetween(startDate, endDate) {
  const out = [];
  let [y, m] = startDate.slice(0, 7).split('-').map(Number);
  const end = endDate.slice(0, 7);
  while (`${y}-${pad(m)}` <= end && out.length <= MAX_MONTHS) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Number of days of [startDate, endDate] that fall inside month ym. */
function daysCovered(ym, startDate, endDate) {
  const first = `${ym}-01`;
  const last = `${ym}-${pad(daysInMonth(ym))}`;
  const from = startDate > first ? startDate : first;
  const to = endDate < last ? endDate : last;
  if (from > to) return 0;
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
}

function round(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Public catalogue so the UI can build its source/segment/metric pickers. */
export function getChartCatalogue() {
  return Object.fromEntries(
    Object.entries(SOURCES).map(([sourceKey, src]) => [
      sourceKey,
      {
        label: src.label,
        segments: Object.fromEntries(
          Object.entries(src.segments).map(([segKey, seg]) => [
            segKey,
            Object.fromEntries(
              Object.entries(seg.metrics).map(([k, m]) => [
                k,
                { label: m.label, unit: m.unit || null, users: !!m.users, lowerIsBetter: !!m.lowerIsBetter },
              ])
            ),
          ])
        ),
      },
    ])
  );
}

export class MonthlyChartService {
  /**
   * @param {object} opts
   * @param {'ga4'|'gsc'|'clarity'} opts.source
   * @param {string} opts.metric
   * @param {'none'|'device'|'country'|'medium'} [opts.segment]
   * @param {string} [opts.segmentValue]  e.g. 'mobile', 'India', 'organic'
   * @param {string} [opts.startDate]     YYYY-MM-DD, defaults to the 1st of the month 11 months ago
   * @param {string} [opts.endDate]       YYYY-MM-DD, defaults to yesterday
   */
  async getMonthlySeries(workspaceId, websiteId, opts = {}) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
      select: { id: true, name: true, domain: true },
    });
    if (!website) throw new NotFoundError('Website not found in this workspace.');

    const source = opts.source || 'ga4';
    const segment = opts.segment || 'none';
    const src = SOURCES[source];
    if (!src) throw new BadRequestError(`Unknown source "${source}". Use ga4, gsc or clarity.`);
    const seg = src.segments[segment];
    if (!seg) throw new BadRequestError(`${src.label} cannot be segmented by "${segment}".`);
    const metricKey = opts.metric || Object.keys(seg.metrics)[0];
    const metric = seg.metrics[metricKey];
    if (!metric) throw new BadRequestError(`Metric "${metricKey}" is not available for ${src.label} with this segment.`);

    const endDate = opts.endDate || yesterday();
    let startDate = opts.startDate;
    if (!startDate) {
      const d = new Date(endDate);
      d.setMonth(d.getMonth() - 11);
      startDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
    }
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || startDate > endDate) {
      throw new BadRequestError('startDate and endDate must be YYYY-MM-DD with startDate on or before endDate.');
    }
    const months = monthsBetween(startDate, endDate);
    if (months.length > MAX_MONTHS) throw new BadRequestError(`Choose a range of ${MAX_MONTHS} months or fewer.`);

    const where = { websiteId, date: { gte: startDate, lte: endDate } };
    const segmentValue = segment !== 'none' ? opts.segmentValue || '' : '';
    if (segmentValue) where[seg.column] = segmentValue;

    const neededFields = new Set(['date']);
    ['field', 'weight', 'num', 'den'].forEach((k) => metric[k] && neededFields.add(metric[k]));
    const select = Object.fromEntries([...neededFields].map((f) => [f, true]));

    const [rows, segmentOptions] = await Promise.all([
      prisma[seg.model].findMany({ where, select }),
      seg.column ? this.getSegmentOptions(seg, websiteId, startDate, endDate) : Promise.resolve([]),
    ]);

    // Bucket daily rows into months
    const buckets = new Map(months.map((ym) => [ym, { sum: 0, num: 0, den: 0, wsum: 0, wtotal: 0, days: new Set() }]));
    for (const r of rows) {
      const b = buckets.get(r.date.slice(0, 7));
      if (!b) continue;
      b.days.add(r.date);
      if (metric.agg === 'sum') b.sum += r[metric.field] || 0;
      else if (metric.agg === 'ratio') {
        b.num += r[metric.num] || 0;
        b.den += r[metric.den] || 0;
      } else {
        const w = r[metric.weight] || 0;
        b.wsum += (r[metric.field] || 0) * w;
        b.wtotal += w;
      }
    }

    const scale = metric.scale || 1;
    const series = months.map((ym) => {
      const b = buckets.get(ym);
      const expectedDays = daysCovered(ym, startDate, endDate);
      let value = null;
      if (b.days.size > 0) {
        if (metric.agg === 'sum') value = b.sum;
        else if (metric.agg === 'ratio') value = b.den > 0 ? round((b.num / b.den) * scale) : 0;
        else value = b.wtotal > 0 ? round((b.wsum / b.wtotal) * scale) : 0;
      }
      return {
        month: ym,
        value,
        daysWithData: b.days.size,
        expectedDays,
        partial: b.days.size > 0 && b.days.size < expectedDays,
      };
    });

    // Clarity history imported from dashboard CSVs: Clarity's own whole-month
    // figures. Used for months the daily sync doesn't fully cover, and only
    // when the selected range includes the whole month.
    let csvMonths = 0;
    if (source === 'clarity' && segment === 'none') {
      const csv = await clarityCsvService.monthlyMetrics(websiteId, startDate, endDate).catch(() => new Map());
      for (const point of series) {
        const m = csv.get(point.month);
        const v = m?.[metricKey];
        if (v === undefined || v === null) continue;
        const wholeMonthInRange = point.expectedDays === daysInMonth(point.month);
        const dailyComplete = point.daysWithData >= point.expectedDays;
        if (!wholeMonthInRange || dailyComplete) continue;
        point.value = v;
        point.source = 'csv';
        point.daysWithData = point.expectedDays;
        point.partial = false;
        csvMonths += 1;
      }
    }

    // Unique users per month: ask GA4 directly instead of summing daily users
    let usersMethod = null;
    if (metric.users) {
      usersMethod = 'sum_of_daily';
      if (source === 'ga4') {
        const live = await this.fetchGA4MonthlyUsers({
          workspaceId,
          websiteId,
          startDate,
          endDate,
          metricKey,
          dimension: seg.ga4Dimension,
          segmentValue,
        });
        if (live) {
          usersMethod = 'ga4_monthly_unique';
          for (const point of series) {
            if (!live.has(point.month)) continue;
            point.value = live.get(point.month);
            // GA4 covers every day in range, whatever was synced locally;
            // the month is only partial if the date range cuts it short.
            point.daysWithData = point.expectedDays;
            point.partial = point.expectedDays < daysInMonth(point.month);
          }
        }
      }
    }

    const values = series.map((p) => p.value).filter((v) => v !== null);
    const total =
      metric.agg === 'sum' && !(metric.users && usersMethod === 'ga4_monthly_unique')
        ? values.reduce((a, v) => a + v, 0)
        : null;

    return {
      website,
      source,
      sourceLabel: src.label,
      segment,
      segmentValue: segmentValue || null,
      segmentOptions,
      metric: metricKey,
      metricLabel: metric.label,
      unit: metric.unit || null,
      lowerIsBetter: !!metric.lowerIsBetter,
      usersMethod,
      csvMonths,
      startDate,
      endDate,
      series,
      stats: {
        total,
        average: values.length
          ? round(values.reduce((a, v) => a + v, 0) / values.length, metric.agg === 'sum' ? 0 : 2)
          : null,
        max: values.length ? Math.max(...values) : null,
        min: values.length ? Math.min(...values) : null,
        monthsWithData: values.length,
      },
    };
  }

  /** Distinct values for the segment dropdown, busiest first. */
  async getSegmentOptions(seg, websiteId, startDate, endDate) {
    const orderField = seg.metrics.sessions ? 'sessions' : 'clicks';
    const grouped = await prisma[seg.model].groupBy({
      by: [seg.column],
      where: { websiteId, date: { gte: startDate, lte: endDate } },
      _sum: { [orderField]: true },
      orderBy: { _sum: { [orderField]: 'desc' } },
      take: 50,
    });
    return grouped.map((g) => g[seg.column]).filter(Boolean);
  }

  /**
   * Monthly unique users from the GA4 Data API (dimension yearMonth).
   * Returns Map<YYYY-MM, number>, or null when GA4 isn't reachable in time.
   *
   * For a segment, one request fetches every value at once (e.g. all
   * countries), so switching between countries afterwards is instant.
   * "All countries" is fetched without the dimension, because unique users
   * can't be summed across segment values.
   */
  async fetchGA4MonthlyUsers({ workspaceId, websiteId, startDate, endDate, metricKey, dimension, segmentValue }) {
    const byDimension = dimension && segmentValue ? dimension : null;
    const cacheKey = [websiteId, startDate, endDate, metricKey, byDimension || ''].join('|');

    let entry = liveCache.get(cacheKey);
    if (!entry || (entry.at && Date.now() - entry.at > LIVE_CACHE_TTL_MS)) {
      // Share one request between concurrent callers; keep it running after a
      // timeout so the result is cached for the next try.
      entry = {
        promise: this.runGA4MonthlyReport({ workspaceId, websiteId, startDate, endDate, metricKey, dimension: byDimension })
          .then((data) => {
            entry.at = Date.now();
            if (!data) liveCache.delete(cacheKey);
            return data;
          })
          .catch((err) => {
            liveCache.delete(cacheKey);
            logger.warn(`Monthly GA4 users fetch failed for website ${websiteId}: ${err.message}`);
            return null;
          }),
      };
      liveCache.set(cacheKey, entry);
    }

    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve('timeout'), LIVE_TIMEOUT_MS);
    });
    const result = await Promise.race([entry.promise, timeout]).finally(() => clearTimeout(timer));
    if (result === 'timeout') {
      logger.warn(`GA4 monthly users for website ${websiteId} took over ${LIVE_TIMEOUT_MS} ms; using sum of daily users for now.`);
      return null;
    }
    if (!result) return null;
    return byDimension ? result.get(segmentValue) || new Map() : result;
  }

  /**
   * One GA4 runReport. Without a dimension returns Map<YYYY-MM, number>;
   * with one returns Map<dimensionValue, Map<YYYY-MM, number>>.
   */
  async runGA4MonthlyReport({ workspaceId, websiteId, startDate, endDate, metricKey, dimension }) {
    const connection = await prisma.integrationConnection.findFirst({
      where: { websiteId, workspaceId, integrationType: 'GA4' },
      include: { googleAccount: true },
    });
    if (!connection?.googleAccount || !connection.selectedProperty || connection.googleAccount.status !== 'CONNECTED') {
      return null;
    }
    const property = connection.selectedProperty.startsWith('properties/')
      ? connection.selectedProperty
      : `properties/${connection.selectedProperty}`;

    const requestBody = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'yearMonth' }, ...(dimension ? [{ name: dimension }] : [])],
      metrics: [{ name: metricKey }],
      limit: 100000,
    };

    const client = await GoogleClientFactory.getAnalyticsDataClient(connection.googleAccount);
    const res = await client.properties.runReport({ property, requestBody });

    const data = new Map();
    for (const row of res.data?.rows || []) {
      const raw = row.dimensionValues[0].value; // YYYYMM
      const ym = `${raw.slice(0, 4)}-${raw.slice(4, 6)}`;
      const value = Number(row.metricValues[0].value) || 0;
      if (!dimension) {
        data.set(ym, value);
      } else {
        const key = row.dimensionValues[1].value;
        if (!data.has(key)) data.set(key, new Map());
        data.get(key).set(ym, value);
      }
    }
    return data;
  }
}

export const monthlyChartService = new MonthlyChartService();
export default monthlyChartService;
