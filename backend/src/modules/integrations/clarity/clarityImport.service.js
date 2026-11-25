// backend/src/modules/integrations/clarity/clarityImport.service.js
// Service for running preset-based Microsoft Clarity manual data imports and deterministic normalisation into MySQL.
//
// Microsoft Clarity Data Export API response shape (project-live-insights):
//   [
//     { "metricName": "Traffic", "information": [
//         { "totalSessionCount": "9554", "totalBotSessionCount": "8369",
//           "distantUserCount": "189733", "PagesPerSessionPercentage": 1.0931,
//           "OS": "Other" }                      <- dimension value keyed by dimension name
//     ]},
//     { "metricName": "DeadClickCount", "information": [ { "sessionsCount": "..", "subTotal": "..", ... } ] },
//     { "metricName": "ScrollDepth",    "information": [ { "averageScrollDepth": 52.1, ... } ] },
//     { "metricName": "PopularPages",   "information": [ { "url": "...", "visitsCount": ".." } ] },
//     { "metricName": "Device",         "information": [ { "name": "PC", "sessionsCount": ".." } ] },
//     ...
//   ]
// Counts are returned as strings. Rows live in `information` (not `rows`).

import prisma from '../../../config/database.js';
import { clarityClientService } from './clarityClient.service.js';
import { clarityConnectionService } from './clarityConnection.service.js';
import { NotFoundError, BadRequestError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';
import { safeAuditLog } from '../../../utils/safeAuditLog.js';

export const CLARITY_REPORT_PRESETS = {
  OVERVIEW: {
    name: 'Overall Traffic & Friction Overview',
    dimensions: [],
  },
  DEVICE: {
    name: 'Device Category Breakdown',
    dimensions: ['Device'],
  },
  BROWSER: {
    name: 'Browser Breakdown',
    dimensions: ['Browser'],
  },
  COUNTRY: {
    name: 'Country & Regional Breakdown',
    dimensions: ['Country/Region'],
  },
  URL: {
    name: 'Page URL & Friction Breakdown',
    dimensions: ['URL'],
  },
  ACQUISITION: {
    name: 'Traffic Source & Medium Breakdown',
    dimensions: ['Source', 'Medium'],
  },
};

const WRITE_BATCH_SIZE = 200;

/**
 * Returns current UTC date formatted as YYYY-MM-DD.
 */
function getCurrentUtcDateString() {
  return new Date().toISOString().split('T')[0];
}

const normaliseKey = (key) => String(key || '').toLowerCase().replace(/[\s_/\-]/g, '');

/**
 * Case/format-insensitive property lookup: pick(row, 'distinctUserCount', 'distantUserCount').
 */
export function pick(row, ...keys) {
  if (!row || typeof row !== 'object') return undefined;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  const wanted = keys.map(normaliseKey);
  for (const [k, v] of Object.entries(row)) {
    if (wanted.includes(normaliseKey(k)) && v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Rows of a metric group (Clarity uses `information`; `rows` kept as a fallback). */
export function groupRows(group) {
  if (Array.isArray(group?.information)) return group.information;
  if (Array.isArray(group?.rows)) return group.rows;
  return [];
}

/** Find a metric group by any of the given names (case/space/slash-insensitive). */
export function findGroup(data, ...names) {
  const wanted = names.map(normaliseKey);
  return data.find((g) => wanted.includes(normaliseKey(g?.metricName)));
}

// Field accessors per metric family
const trafficSessions = (row) => num(pick(row, 'totalSessionCount', 'sessionsCount', 'sessionCount', 'value'));
const trafficBots = (row) => num(pick(row, 'totalBotSessionCount', 'botSessionCount'));
const trafficUsers = (row) => num(pick(row, 'distantUserCount', 'distinctUserCount', 'userCount'));
const trafficPagesPerSession = (row) => num(pick(row, 'PagesPerSessionPercentage', 'pagesPerSession'));
const frictionCount = (row) => num(pick(row, 'subTotal', 'count', 'value'));
const scrollDepth = (row) => num(pick(row, 'averageScrollDepth', 'scrollDepth', 'value'));
const engagementSeconds = (row) => num(pick(row, 'activeTime', 'totalTime', 'value'));
const listSessions = (row) => num(pick(row, 'sessionsCount', 'visitsCount', 'totalSessionCount', 'value'));

/** Primary numeric value of a row, whatever metric it belongs to. */
function primaryValue(row) {
  return num(
    pick(
      row,
      'subTotal',
      'totalSessionCount',
      'sessionsCount',
      'visitsCount',
      'averageScrollDepth',
      'activeTime',
      'totalTime',
      'value'
    )
  );
}

/**
 * Site-wide totals from one Clarity OVERVIEW response (no dimensions).
 * Used both when importing and when reporting from stored snapshots.
 */
export function summariseOverview(data = []) {
  const g = (...names) => findGroup(data, ...names);
  const traffic = g('Traffic');
  const trafficRows = groupRows(traffic);
  const sum = (group, fn) => groupRows(group).reduce((acc, row) => acc + fn(row), 0);
  const avg = (group, fn) => {
    const rows = groupRows(group);
    return rows.length ? rows.reduce((acc, row) => acc + fn(row), 0) / rows.length : 0;
  };

  const sessions = Math.round(sum(traffic, trafficSessions));
  const pagesPerSession = sessions > 0
    ? trafficRows.reduce((acc, r) => acc + trafficPagesPerSession(r) * trafficSessions(r), 0) / sessions
    : avg(traffic, trafficPagesPerSession);
  const engagement = g('EngagementTime', 'Engagement Time');

  const list = (group, keyFn) =>
    groupRows(group)
      .map((row) => ({ key: keyFn(row), sessions: Math.round(listSessions(row)) }))
      .filter((x) => x.key);

  return {
    sessions,
    botSessions: Math.round(sum(traffic, trafficBots)),
    distinctUsers: Math.round(sum(traffic, trafficUsers)),
    pagesPerSession: parseFloat(pagesPerSession.toFixed(2)),
    rageClickCount: Math.round(sum(g('RageClickCount', 'Rage Click Count'), frictionCount)),
    deadClickCount: Math.round(sum(g('DeadClickCount', 'Dead Click Count'), frictionCount)),
    excessiveScrollCount: Math.round(sum(g('ExcessiveScroll', 'Excessive Scroll'), frictionCount)),
    quickbackClickCount: Math.round(sum(g('QuickbackClick', 'Quick Back', 'Quickback'), frictionCount)),
    scriptErrorCount: Math.round(sum(g('ScriptErrorCount', 'Script Error Count'), frictionCount)),
    errorClickCount: Math.round(sum(g('ErrorClickCount', 'Error Click Count'), frictionCount)),
    avgScrollDepth: parseFloat(avg(g('ScrollDepth', 'Scroll Depth'), scrollDepth).toFixed(2)),
    avgTimeOnPageSec: parseFloat(avg(engagement, engagementSeconds).toFixed(2)),
    totalTimeSec: parseFloat(avg(engagement, (r) => num(pick(r, 'totalTime'))).toFixed(2)),
    pages: list(g('PopularPages', 'Popular Pages'), (r) => String(pick(r, 'url', 'URL', 'name') || '').substring(0, 500)),
    devices: list(g('Device'), (r) => String(pick(r, 'name', 'Device') || '').toLowerCase().substring(0, 50)),
    countries: list(g('Country', 'Country/Region', 'CountryRegion'), (r) => String(pick(r, 'name', 'Country/Region', 'Country') || '').substring(0, 100)),
  };
}

async function runInBatches(ops) {
  for (let i = 0; i < ops.length; i += WRITE_BATCH_SIZE) {
    await prisma.$transaction(ops.slice(i, i + WRITE_BATCH_SIZE));
  }
}

function isAuthError(err) {
  return err?.statusCode === 401 || err?.statusCode === 403 || err?.status === 401 || err?.status === 403;
}

export class ClarityImportService {
  /**
   * Execute a manual Microsoft Clarity data import for a website.
   *
   * @param {object} params
   * @param {string} params.workspaceId
   * @param {string} params.websiteId
   * @param {number} params.numOfDays - 1, 2, or 3
   * @param {string} params.preset - OVERVIEW, DEVICE, BROWSER, COUNTRY, URL, ACQUISITION
   * @param {object} params.user - Authenticated user
   */
  async executeManualImport({ workspaceId, websiteId, numOfDays = 1, preset = 'OVERVIEW', user }) {
    const days = Number(numOfDays);
    if (![1, 2, 3].includes(days)) {
      throw new BadRequestError('numOfDays must be either 1, 2, or 3.');
    }

    const presetConfig = CLARITY_REPORT_PRESETS[preset];
    if (!presetConfig) {
      throw new BadRequestError(`Invalid report preset "${preset}". Available: ${Object.keys(CLARITY_REPORT_PRESETS).join(', ')}`);
    }

    // 1. Fetch integration connection on website
    const connection = await prisma.integrationConnection.findFirst({
      where: {
        websiteId,
        workspaceId,
        integrationType: 'CLARITY',
      },
      include: {
        clarityConnection: true,
        website: true,
      },
    });

    if (!connection || !connection.clarityConnection) {
      throw new NotFoundError('Microsoft Clarity is not connected or mapped to this website.');
    }

    if (connection.clarityConnection.status !== 'CONNECTED') {
      throw new BadRequestError('Clarity project connection is inactive or token has been revoked.');
    }

    // 2. Check and increment local daily quota (10 requests/day per project)
    const quotaInfo = await clarityConnectionService.checkAndIncrementQuota(connection.clarityConnection.id);

    // 3. Mark integration connection as SYNCING
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { status: 'SYNCING' },
    });

    const startTime = Date.now();
    const windowEnd = new Date();
    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const dateStr = getCurrentUtcDateString();

    try {
      // 4. Decrypt API token in memory
      const { token } = await clarityConnectionService.getDecryptedToken(workspaceId, connection.clarityConnection.id);

      // 5. Query official Microsoft Clarity endpoint
      const rawData = await clarityClientService.fetchLiveInsights(token, {
        numOfDays: days,
        dimensions: presetConfig.dimensions,
      });

      if (!Array.isArray(rawData)) {
        throw new BadRequestError('Unexpected response format from Microsoft Clarity. Expected an array of metric groups.');
      }

      // Count rows across metric groups
      const totalRowCount = rawData.reduce((sum, group) => sum + groupRows(group).length, 0);
      // The API caps a response at 1,000 rows and cannot paginate
      const isTruncated = rawData.some((group) => groupRows(group).length >= 1000);

      // 6. Create immutable snapshot record in database
      const snapshot = await prisma.clarityImportSnapshot.create({
        data: {
          workspaceId,
          clarityConnectionId: connection.clarityConnection.id,
          websiteId,
          requestedNumOfDays: days,
          windowStart,
          windowEnd,
          preset,
          dimensions: presetConfig.dimensions.join(',') || 'None',
          rawResponseJson: JSON.stringify(rawData),
          rowCount: totalRowCount,
          status: 'COMPLETED',
          isTruncated,
        },
      });

      // 7. Deterministic Normalisation into Typed Metrics
      const rowsInserted = await this.normaliseAndPersist({
        websiteId,
        dateStr,
        snapshotId: snapshot.id,
        preset,
        dimensions: presetConfig.dimensions,
        data: rawData,
      });

      if (totalRowCount === 0) {
        logger.warn(
          `Clarity returned no rows for ${connection.website.domain} (preset ${preset}). ` +
            'The project may have no recorded sessions in the selected window.'
        );
      }

      // 8. Update IntegrationConnection status
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: {
          status: 'CONNECTED',
          lastSyncAt: new Date(),
          lastSyncStatus: 'COMPLETED',
          lastError: null,
          isHistoricalComplete: true,
        },
      });

      await prisma.clarityConnection.update({
        where: { id: connection.clarityConnection.id },
        data: { lastSyncAt: new Date(), lastError: null },
      }).catch(() => {});

      // 9. Sync History record
      await prisma.syncHistory.create({
        data: {
          connectionId: connection.id,
          websiteId,
          integrationType: 'CLARITY',
          status: 'COMPLETED',
          startedAt: new Date(startTime),
          completedAt: new Date(),
          rowsFetched: totalRowCount,
          rowsInserted,
          apiCallsUsed: 1,
          dateRangeStart: windowStart.toISOString().split('T')[0],
          dateRangeEnd: windowEnd.toISOString().split('T')[0],
        },
      });

      // 10. Audit Log
      await safeAuditLog({
        workspaceId,
        userId: user?.id || null,
        action: 'integration.clarity_imported',
        entityType: 'Website',
        entityId: websiteId,
        metadata: {
          preset,
          numOfDays: days,
          totalRowCount,
          snapshotId: snapshot.id,
        },
      });

      logger.info(
        `Clarity data import completed for ${connection.website.domain}. Snapshot: ${snapshot.id}, rows: ${totalRowCount}, stored: ${rowsInserted}`
      );

      return {
        success: true,
        snapshotId: snapshot.id,
        preset,
        numOfDays: days,
        rowCount: totalRowCount,
        rowsFetched: totalRowCount,
        rowsInserted,
        isTruncated,
        quotaRemaining: quotaInfo.callsRemaining,
        durationMs: Date.now() - startTime,
      };
    } catch (importErr) {
      logger.error(`Clarity import failed for website ${websiteId}: ${importErr.message}`);

      // A failed pull does not unmap the project; only auth failures need user action.
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: {
          status: isAuthError(importErr) ? 'EXPIRED' : 'CONNECTED',
          lastSyncStatus: 'FAILED',
          lastError: importErr.message,
        },
      }).catch(() => {});

      await prisma.clarityConnection.update({
        where: { id: connection.clarityConnection.id },
        data: {
          lastError: importErr.message,
          // Microsoft says the daily quota is used up: mirror that locally
          ...(importErr.statusCode === 429 ? { apiCallsToday: 10 } : {}),
          ...(isAuthError(importErr) ? { status: 'EXPIRED' } : {}),
        },
      }).catch(() => {});

      await prisma.syncHistory.create({
        data: {
          connectionId: connection.id,
          websiteId,
          integrationType: 'CLARITY',
          status: 'FAILED',
          startedAt: new Date(startTime),
          completedAt: new Date(),
          rowsFetched: 0,
          rowsInserted: 0,
          apiCallsUsed: 1,
          errorMessage: importErr.message,
          dateRangeStart: windowStart.toISOString().split('T')[0],
          dateRangeEnd: windowEnd.toISOString().split('T')[0],
        },
      }).catch(() => {});

      throw importErr;
    }
  }

  /**
   * Deterministic normalisation of raw Microsoft Clarity JSON into typed models.
   * Returns the number of typed rows written.
   */
  async normaliseAndPersist({ websiteId, dateStr, snapshotId, preset, dimensions, data }) {
    if (!Array.isArray(data)) return 0;

    const dims = dimensions || CLARITY_REPORT_PRESETS[preset]?.dimensions || [];
    const ops = [];

    const trafficGroup = findGroup(data, 'Traffic');
    const deadClickGroup = findGroup(data, 'DeadClickCount', 'Dead Click Count');
    const rageClickGroup = findGroup(data, 'RageClickCount', 'Rage Click Count');
    const excessiveScrollGroup = findGroup(data, 'ExcessiveScroll', 'Excessive Scroll');
    const quickbackGroup = findGroup(data, 'QuickbackClick', 'Quick Back', 'Quickback');
    const scriptErrorGroup = findGroup(data, 'ScriptErrorCount', 'Script Error Count');
    const errorClickGroup = findGroup(data, 'ErrorClickCount', 'Error Click Count');
    const scrollDepthGroup = findGroup(data, 'ScrollDepth', 'Scroll Depth');
    const engagementGroup = findGroup(data, 'EngagementTime', 'Engagement Time');
    const deviceGroup = findGroup(data, 'Device');
    const countryGroup = findGroup(data, 'Country', 'Country/Region', 'CountryRegion');
    const popularPagesGroup = findGroup(data, 'PopularPages', 'Popular Pages');

    // ─── A. OVERVIEW: one site-wide daily row ──────────────────────────────
    if (preset === 'OVERVIEW' || !preset) {
      // eslint-disable-next-line no-unused-vars
      const { pages, devices, countries, totalTimeSec, ...values } = summariseOverview(data);

      ops.push(
        prisma.clarityDailyMetric.upsert({
          where: { websiteId_date: { websiteId, date: dateStr } },
          update: values,
          create: { websiteId, date: dateStr, ...values },
        })
      );

      // Device / Country / Popular pages lists that come with every response
      for (const row of groupRows(deviceGroup)) {
        const device = String(pick(row, 'name', 'Device') || 'unknown').toLowerCase().substring(0, 50);
        const devSessions = Math.round(listSessions(row));
        ops.push(
          prisma.clarityDeviceMetric.upsert({
            where: { websiteId_date_device: { websiteId, date: dateStr, device } },
            update: { sessions: devSessions },
            create: { websiteId, date: dateStr, device, sessions: devSessions },
          })
        );
      }

      for (const row of groupRows(countryGroup)) {
        const country = String(pick(row, 'name', 'Country/Region', 'Country') || 'Unknown').substring(0, 100);
        const cSessions = Math.round(listSessions(row));
        ops.push(
          prisma.clarityCountryMetric.upsert({
            where: { websiteId_date_country: { websiteId, date: dateStr, country } },
            update: { sessions: cSessions },
            create: { websiteId, date: dateStr, country, sessions: cSessions },
          })
        );
      }

      for (const row of groupRows(popularPagesGroup).slice(0, 200)) {
        const page = String(pick(row, 'url', 'URL', 'name') || '').substring(0, 500);
        if (!page) continue;
        const pSessions = Math.round(listSessions(row));
        ops.push(
          prisma.clarityPageMetric.upsert({
            where: { websiteId_date_page: { websiteId, date: dateStr, page } },
            update: { sessions: pSessions },
            create: { websiteId, date: dateStr, page, sessions: pSessions },
          })
        );
      }
    }

    // ─── B. DEVICE / COUNTRY: Traffic split by the dimension value ─────────
    const dimensionTraffic = (dimName) => {
      const buckets = new Map();
      for (const row of groupRows(trafficGroup)) {
        const key = pick(row, dimName);
        if (key === undefined) continue;
        const b = buckets.get(String(key)) || { sessions: 0, ppsWeight: 0 };
        const s = trafficSessions(row);
        b.sessions += s;
        b.ppsWeight += trafficPagesPerSession(row) * s;
        buckets.set(String(key), b);
      }
      return buckets;
    };

    if (preset === 'DEVICE') {
      let buckets = dimensionTraffic('Device');
      if (buckets.size === 0) {
        // Fallback: the standalone Device list ({ name, sessionsCount })
        buckets = new Map(groupRows(deviceGroup).map((r) => [String(pick(r, 'name') || 'unknown'), { sessions: listSessions(r), ppsWeight: 0 }]));
      }
      for (const [name, b] of buckets) {
        const device = name.toLowerCase().substring(0, 50);
        const values = {
          sessions: Math.round(b.sessions),
          pagesPerSession: b.sessions > 0 ? parseFloat((b.ppsWeight / b.sessions).toFixed(2)) : 0,
        };
        ops.push(
          prisma.clarityDeviceMetric.upsert({
            where: { websiteId_date_device: { websiteId, date: dateStr, device } },
            update: values,
            create: { websiteId, date: dateStr, device, ...values },
          })
        );
      }
    }

    if (preset === 'COUNTRY') {
      let buckets = dimensionTraffic('Country/Region');
      if (buckets.size === 0) {
        buckets = new Map(groupRows(countryGroup).map((r) => [String(pick(r, 'name') || 'Unknown'), { sessions: listSessions(r), ppsWeight: 0 }]));
      }
      for (const [name, b] of buckets) {
        const country = name.substring(0, 100);
        const values = {
          sessions: Math.round(b.sessions),
          pagesPerSession: b.sessions > 0 ? parseFloat((b.ppsWeight / b.sessions).toFixed(2)) : 0,
        };
        ops.push(
          prisma.clarityCountryMetric.upsert({
            where: { websiteId_date_country: { websiteId, date: dateStr, country } },
            update: values,
            create: { websiteId, date: dateStr, country, ...values },
          })
        );
      }
    }

    // ─── C. URL: per-page sessions + friction from every metric group ──────
    if (preset === 'URL') {
      const pages = new Map();
      const bucket = (row) => {
        const url = pick(row, 'URL', 'url');
        if (!url) return null;
        const key = String(url).substring(0, 500);
        if (!pages.has(key)) {
          pages.set(key, { sessions: 0, deadClicks: 0, rageClicks: 0, quickBacks: 0, scroll: [], time: [] });
        }
        return pages.get(key);
      };

      for (const row of groupRows(trafficGroup)) { const p = bucket(row); if (p) p.sessions += trafficSessions(row); }
      for (const row of groupRows(deadClickGroup)) { const p = bucket(row); if (p) p.deadClicks += frictionCount(row); }
      for (const row of groupRows(rageClickGroup)) { const p = bucket(row); if (p) p.rageClicks += frictionCount(row); }
      for (const row of groupRows(quickbackGroup)) { const p = bucket(row); if (p) p.quickBacks += frictionCount(row); }
      for (const row of groupRows(scrollDepthGroup)) { const p = bucket(row); if (p) p.scroll.push(scrollDepth(row)); }
      for (const row of groupRows(engagementGroup)) { const p = bucket(row); if (p) p.time.push(engagementSeconds(row)); }

      if (pages.size === 0) {
        for (const row of groupRows(popularPagesGroup)) {
          const p = bucket(row);
          if (p) p.sessions += listSessions(row);
        }
      }

      const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
      for (const [page, p] of pages) {
        const values = {
          sessions: Math.round(p.sessions),
          deadClicks: Math.round(p.deadClicks),
          rageClicks: Math.round(p.rageClicks),
          quickBacks: Math.round(p.quickBacks),
          avgScrollDepth: parseFloat(mean(p.scroll).toFixed(2)),
          avgTimeOnPageSec: parseFloat(mean(p.time).toFixed(2)),
        };
        ops.push(
          prisma.clarityPageMetric.upsert({
            where: { websiteId_date_page: { websiteId, date: dateStr, page } },
            update: values,
            create: { websiteId, date: dateStr, page, ...values },
          })
        );
      }
    }

    await runInBatches(ops);

    // ─── D. RAW DIMENSION METRICS (every preset, incl. BROWSER/ACQUISITION) ─
    // Replace earlier rows for the same day + dimension set so re-imports don't duplicate.
    await prisma.clarityDimensionMetric.deleteMany({
      where: {
        websiteId,
        date: dateStr,
        dimension1Name: dims[0] || null,
        dimension2Name: dims[1] || null,
      },
    });

    const dimensionRows = [];
    for (const group of data) {
      for (const row of groupRows(group)) {
        const dimVals = dims.map((d) => {
          const v = pick(row, d);
          return v === undefined ? null : String(v).substring(0, 255);
        });
        dimensionRows.push({
          websiteId,
          snapshotId,
          date: dateStr,
          metricName: String(group.metricName || 'Unknown').substring(0, 100),
          dimension1Name: dims[0] || null,
          dimension1Val: dimVals[0] ?? null,
          dimension2Name: dims[1] || null,
          dimension2Val: dimVals[1] ?? null,
          dimension3Name: dims[2] || null,
          dimension3Val: dimVals[2] ?? null,
          value: parseFloat(primaryValue(row).toFixed(4)),
        });
      }
    }

    for (let i = 0; i < dimensionRows.length; i += 500) {
      await prisma.clarityDimensionMetric.createMany({ data: dimensionRows.slice(i, i + 500) });
    }

    return ops.length + dimensionRows.length;
  }
}

export const clarityImportService = new ClarityImportService();
export default clarityImportService;
