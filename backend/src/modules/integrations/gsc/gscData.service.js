// backend/src/modules/integrations/gsc/gscData.service.js
// Service for importing and persisting Google Search Console performance data into MySQL.

import GoogleClientFactory from '../google/googleClient.factory.js';
import prisma from '../../../config/database.js';
import { NotFoundError, BadRequestError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';
import { safeAuditLog } from '../../../utils/safeAuditLog.js';

const PAGE_SIZE = 25000; // Search Analytics API maximum rowLimit
const WRITE_BATCH_SIZE = 250;

/**
 * Get date N days ago as YYYY-MM-DD (UTC).
 */
function getDaysAgoDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

/**
 * Pull every row for a Search Analytics request, following startRow pagination.
 * dataState "all" includes fresh (not yet finalised) data so recent days are not missing.
 */
async function fetchSearchAnalyticsRows(client, siteUrl, requestBody, onRequest = () => {}) {
  const rows = [];
  let startRow = 0;

  while (true) {
    onRequest();
    const response = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        type: 'web',
        dataState: 'all',
        ...requestBody,
        rowLimit: PAGE_SIZE,
        startRow,
      },
    });
    const page = response.data.rows || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    startRow += page.length;
  }

  return rows;
}

/**
 * Run upserts in batched transactions instead of one round trip per row.
 * Large properties return tens of thousands of query/page rows; sequential
 * single upserts made syncs take so long they looked stuck in SYNCING.
 */
async function upsertInBatches(rows, buildUpsert) {
  let written = 0;
  for (let i = 0; i < rows.length; i += WRITE_BATCH_SIZE) {
    const ops = rows.slice(i, i + WRITE_BATCH_SIZE).map(buildUpsert).filter(Boolean);
    if (ops.length === 0) continue;
    await prisma.$transaction(ops);
    written += ops.length;
  }
  return written;
}

function metricValues(row) {
  return {
    clicks: Math.round(row.clicks || 0),
    impressions: Math.round(row.impressions || 0),
    ctr: parseFloat((row.ctr || 0).toFixed(4)),
    avgPosition: parseFloat((row.position || 0).toFixed(2)),
  };
}

/**
 * Turn a googleapis error into a readable message and flag auth problems.
 */
function describeGoogleError(err) {
  const status = err?.code || err?.response?.status || err?.status;
  const apiMessage = err?.response?.data?.error?.message || err?.errors?.[0]?.message || err?.message;
  const isAuth =
    status === 401 ||
    String(apiMessage || '').includes('invalid_grant') ||
    String(apiMessage || '').includes('revoked');

  if (status === 403) {
    return {
      isAuth: false,
      message: `Google account does not have access to this Search Console property (HTTP 403): ${apiMessage}`,
    };
  }
  return { isAuth, message: apiMessage || 'Unknown Google Search Console error' };
}

export class GSCDataService {
  /**
   * Import Google Search Console data for a website across a date range.
   */
  async importGSCData({ workspaceId, websiteId, startDate, endDate, user }) {
    // GSC data typically has a 2-3 day latency window for final data
    const start = startDate || getDaysAgoDate(30);
    const end = endDate || getDaysAgoDate(1);

    if (start > end) {
      throw new BadRequestError(`Invalid GSC date range: ${start} is after ${end}.`);
    }

    // 1. Fetch connection details
    const connection = await prisma.integrationConnection.findFirst({
      where: {
        websiteId,
        workspaceId,
        integrationType: 'GSC',
      },
      include: {
        googleAccount: true,
        website: true,
      },
    });

    if (!connection || !connection.googleAccount) {
      throw new NotFoundError('Google Search Console is not connected to this website.');
    }

    if (!connection.selectedProperty) {
      throw new BadRequestError('No Search Console site property is associated with this website.');
    }

    if (connection.googleAccount.status !== 'CONNECTED') {
      throw new BadRequestError('Google account authorization is expired or revoked. Please reconnect.');
    }

    // Set connection status to SYNCING
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { status: 'SYNCING' },
    });

    const startTime = Date.now();
    let rowsFetched = 0;
    let rowsInserted = 0;
    let apiCallsUsed = 0;
    const countCall = () => { apiCallsUsed++; };

    try {
      const gscClient = await GoogleClientFactory.getSearchConsoleClient(connection.googleAccount);
      const siteUrl = connection.selectedProperty;
      const range = { startDate: start, endDate: end };

      // ─── 1. Daily Aggregates (Clicks, Impressions, CTR, Position) ─────────
      const dailyRows = await fetchSearchAnalyticsRows(gscClient, siteUrl, { ...range, dimensions: ['date'] }, countCall);
      rowsFetched += dailyRows.length;
      rowsInserted += await upsertInBatches(dailyRows, (row) => {
        const date = row.keys[0];
        const values = metricValues(row);
        return prisma.gSCDailyMetric.upsert({
          where: { websiteId_date: { websiteId, date } },
          update: values,
          create: { websiteId, date, ...values },
        });
      });

      // ─── 2. Queries (Keywords) ────────────────────────────────────────────
      const queryRows = await fetchSearchAnalyticsRows(gscClient, siteUrl, { ...range, dimensions: ['date', 'query'] }, countCall);
      rowsFetched += queryRows.length;
      rowsInserted += await upsertInBatches(queryRows, (row) => {
        const [date, rawQuery] = row.keys;
        const query = (rawQuery || '').substring(0, 500);
        if (!query) return null;
        const values = metricValues(row);
        return prisma.gSCQueryMetric.upsert({
          where: {
            websiteId_date_query_country_device: { websiteId, date, query, country: '', device: '' },
          },
          update: values,
          create: { websiteId, date, query, country: '', device: '', ...values },
        });
      });

      // ─── 3. Pages ─────────────────────────────────────────────────────────
      const pageRows = await fetchSearchAnalyticsRows(gscClient, siteUrl, { ...range, dimensions: ['date', 'page'] }, countCall);
      rowsFetched += pageRows.length;
      rowsInserted += await upsertInBatches(pageRows, (row) => {
        const [date, rawPage] = row.keys;
        const page = (rawPage || '').substring(0, 500);
        if (!page) return null;
        const values = metricValues(row);
        return prisma.gSCPageMetric.upsert({
          where: {
            websiteId_date_page_country_device: { websiteId, date, page, country: '', device: '' },
          },
          update: values,
          create: { websiteId, date, page, country: '', device: '', ...values },
        });
      });

      // ─── 4. Device Categories ─────────────────────────────────────────────
      const deviceRows = await fetchSearchAnalyticsRows(gscClient, siteUrl, { ...range, dimensions: ['date', 'device'] }, countCall);
      rowsFetched += deviceRows.length;
      rowsInserted += await upsertInBatches(deviceRows, (row) => {
        const [date, rawDevice] = row.keys;
        const device = String(rawDevice || 'unknown').toLowerCase();
        const values = metricValues(row);
        return prisma.gSCDeviceMetric.upsert({
          where: { websiteId_date_device: { websiteId, date, device } },
          update: values,
          create: { websiteId, date, device, ...values },
        });
      });

      // ─── 5. Countries ─────────────────────────────────────────────────────
      const countryRows = await fetchSearchAnalyticsRows(gscClient, siteUrl, { ...range, dimensions: ['date', 'country'] }, countCall);
      rowsFetched += countryRows.length;
      rowsInserted += await upsertInBatches(countryRows, (row) => {
        const [date, rawCountry] = row.keys;
        const country = String(rawCountry || 'zzz').substring(0, 100);
        const values = metricValues(row);
        return prisma.gSCCountryMetric.upsert({
          where: { websiteId_date_country: { websiteId, date, country } },
          update: values,
          create: { websiteId, date, country, ...values },
        });
      });

      if (dailyRows.length === 0) {
        logger.warn(
          `GSC returned no rows for ${siteUrl} between ${start} and ${end}. ` +
            'Check that the selected property matches the website (https:// vs sc-domain:) and has traffic.'
        );
      }

      // ─── Finalize Connection Status & Sync History ────────────────────────
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

      await prisma.syncHistory.create({
        data: {
          connectionId: connection.id,
          websiteId,
          integrationType: 'GSC',
          status: 'COMPLETED',
          startedAt: new Date(startTime),
          completedAt: new Date(),
          rowsFetched,
          rowsInserted,
          apiCallsUsed,
          dateRangeStart: start,
          dateRangeEnd: end,
        },
      });

      await safeAuditLog({
        workspaceId,
        userId: user?.id || null,
        action: 'integration.gsc_data_imported',
        entityType: 'Website',
        entityId: websiteId,
        metadata: { startDate: start, endDate: end, rowsFetched, rowsInserted },
      });

      logger.info(
        `GSC data import completed for website ${connection.website.domain}. Rows fetched: ${rowsFetched}, inserted: ${rowsInserted}`
      );

      return {
        success: true,
        startDate: start,
        endDate: end,
        rowsFetched,
        rowsInserted,
        apiCallsUsed,
        durationMs: Date.now() - startTime,
      };
    } catch (importErr) {
      const { isAuth, message } = describeGoogleError(importErr);
      logger.error(`GSC import failed for website ${websiteId}: ${message}`);

      // Keep the property binding "CONNECTED" on transient failures so dashboards,
      // schedulers and the AI assistant still treat GSC as connected. Only auth
      // failures need the user to act.
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: {
          status: isAuth ? 'EXPIRED' : 'CONNECTED',
          lastSyncStatus: 'FAILED',
          lastError: message,
        },
      }).catch(() => {});

      await prisma.syncHistory.create({
        data: {
          connectionId: connection.id,
          websiteId,
          integrationType: 'GSC',
          status: 'FAILED',
          startedAt: new Date(startTime),
          completedAt: new Date(),
          rowsFetched,
          rowsInserted,
          apiCallsUsed,
          errorMessage: message,
          dateRangeStart: start,
          dateRangeEnd: end,
        },
      }).catch(() => {});

      throw new BadRequestError(`GSC data import failed: ${message}`);
    }
  }
}

export const gscDataService = new GSCDataService();
export default gscDataService;
