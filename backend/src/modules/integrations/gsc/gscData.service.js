// backend/src/modules/integrations/gsc/gscData.service.js
// Service for importing and persisting Google Search Console performance data into MySQL.

import GoogleClientFactory from '../google/googleClient.factory.js';
import prisma from '../../../config/database.js';
import { NotFoundError, BadRequestError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

/**
 * Get date N days ago as YYYY-MM-DD.
 */
function getDaysAgoDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

// Search Analytics limits each response page. Continue while a full page is
// returned so large properties do not silently lose most query/page rows.
async function fetchSearchAnalyticsRows(client, siteUrl, requestBody, onRequest = () => {}) {
  const pageSize = 25000;
  const rows = [];
  let startRow = 0;

  while (true) {
    onRequest();
    const response = await client.searchanalytics.query({
      siteUrl,
      requestBody: { ...requestBody, rowLimit: pageSize, startRow },
    });
    const page = response.data.rows || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    startRow += page.length;
  }

  return rows;
}

export class GSCDataService {
  /**
   * Import Google Search Console data for a website across a date range.
   */
  async importGSCData({ workspaceId, websiteId, startDate, endDate, user }) {
    // GSC data typically has a 2-3 day latency window
    const start = startDate || getDaysAgoDate(30);
    const end = endDate || getDaysAgoDate(3);

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

    try {
      const gscClient = await GoogleClientFactory.getSearchConsoleClient(connection.googleAccount);
      const siteUrl = connection.selectedProperty;

      // ─── 1. Daily Aggregates (Clicks, Impressions, CTR, Position) ─────────
      const dailyRows = await fetchSearchAnalyticsRows(gscClient, siteUrl, {
          startDate: start,
          endDate: end,
          dimensions: ['date'],
      }, () => { apiCallsUsed++; });
      rowsFetched += dailyRows.length;

      for (const row of dailyRows) {
        const date = row.keys[0];
        const clicks = Math.round(row.clicks || 0);
        const impressions = Math.round(row.impressions || 0);
        const ctr = parseFloat((row.ctr || 0).toFixed(4));
        const avgPosition = parseFloat((row.position || 0).toFixed(2));

        await prisma.gSCDailyMetric.upsert({
          where: {
            websiteId_date: {
              websiteId,
              date,
            },
          },
          update: {
            clicks,
            impressions,
            ctr,
            avgPosition,
          },
          create: {
            websiteId,
            date,
            clicks,
            impressions,
            ctr,
            avgPosition,
          },
        });
        rowsInserted++;
      }

      // ─── 2. Top Queries (Keywords) ────────────────────────────────────────
      const queryRows = await fetchSearchAnalyticsRows(gscClient, siteUrl, {
          startDate: start,
          endDate: end,
          dimensions: ['date', 'query'],
      }, () => { apiCallsUsed++; });
      rowsFetched += queryRows.length;

      for (const row of queryRows) {
        const [date, query] = row.keys;
        const clicks = Math.round(row.clicks || 0);
        const impressions = Math.round(row.impressions || 0);
        const ctr = parseFloat((row.ctr || 0).toFixed(4));
        const avgPosition = parseFloat((row.position || 0).toFixed(2));

        await prisma.gSCQueryMetric.upsert({
          where: {
            websiteId_date_query_country_device: {
              websiteId,
              date,
              query: (query || '').substring(0, 500),
              country: '',
              device: '',
            },
          },
          update: {
            clicks,
            impressions,
            ctr,
            avgPosition,
          },
          create: {
            websiteId,
            date,
            query: (query || '').substring(0, 500),
            clicks,
            impressions,
            ctr,
            avgPosition,
            country: '',
            device: '',
          },
        });
        rowsInserted++;
      }

      // ─── 3. Top Pages ─────────────────────────────────────────────────────
      const pageRows = await fetchSearchAnalyticsRows(gscClient, siteUrl, {
          startDate: start,
          endDate: end,
          dimensions: ['date', 'page'],
      }, () => { apiCallsUsed++; });
      rowsFetched += pageRows.length;

      for (const row of pageRows) {
        const [date, page] = row.keys;
        const clicks = Math.round(row.clicks || 0);
        const impressions = Math.round(row.impressions || 0);
        const ctr = parseFloat((row.ctr || 0).toFixed(4));
        const avgPosition = parseFloat((row.position || 0).toFixed(2));

        await prisma.gSCPageMetric.upsert({
          where: {
            websiteId_date_page_country_device: {
              websiteId,
              date,
              page: (page || '').substring(0, 500),
              country: '',
              device: '',
            },
          },
          update: {
            clicks,
            impressions,
            ctr,
            avgPosition,
          },
          create: {
            websiteId,
            date,
            page: (page || '').substring(0, 500),
            clicks,
            impressions,
            ctr,
            avgPosition,
            country: '',
            device: '',
          },
        });
        rowsInserted++;
      }

      // ─── 4. Device Categories ─────────────────────────────────────────────
      const deviceRows = await fetchSearchAnalyticsRows(gscClient, siteUrl, {
          startDate: start,
          endDate: end,
          dimensions: ['date', 'device'],
      }, () => { apiCallsUsed++; });
      rowsFetched += deviceRows.length;

      for (const row of deviceRows) {
        const [date, device] = row.keys;
        const clicks = Math.round(row.clicks || 0);
        const impressions = Math.round(row.impressions || 0);
        const ctr = parseFloat((row.ctr || 0).toFixed(4));
        const avgPosition = parseFloat((row.position || 0).toFixed(2));

        await prisma.gSCDeviceMetric.upsert({
          where: {
            websiteId_date_device: {
              websiteId,
              date,
              device: device.toLowerCase(),
            },
          },
          update: {
            clicks,
            impressions,
            ctr,
            avgPosition,
          },
          create: {
            websiteId,
            date,
            device: device.toLowerCase(),
            clicks,
            impressions,
            ctr,
            avgPosition,
          },
        });
        rowsInserted++;
      }

      // ─── 5. Countries ─────────────────────────────────────────────────────
      const countryRows = await fetchSearchAnalyticsRows(gscClient, siteUrl, {
          startDate: start,
          endDate: end,
          dimensions: ['date', 'country'],
      }, () => { apiCallsUsed++; });
      rowsFetched += countryRows.length;

      for (const row of countryRows) {
        const [date, country] = row.keys;
        const clicks = Math.round(row.clicks || 0);
        const impressions = Math.round(row.impressions || 0);
        const ctr = parseFloat((row.ctr || 0).toFixed(4));
        const avgPosition = parseFloat((row.position || 0).toFixed(2));

        await prisma.gSCCountryMetric.upsert({
          where: {
            websiteId_date_country: {
              websiteId,
              date,
              country,
            },
          },
          update: {
            clicks,
            impressions,
            ctr,
            avgPosition,
          },
          create: {
            websiteId,
            date,
            country,
            clicks,
            impressions,
            ctr,
            avgPosition,
          },
        });
        rowsInserted++;
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

      // Audit Log
      await prisma.auditLog.create({
        data: {
          workspaceId,
          userId: user.id,
          action: 'integration.gsc_data_imported',
          entityType: 'Website',
          entityId: websiteId,
          metadata: {
            startDate: start,
            endDate: end,
            rowsFetched,
            rowsInserted,
          },
        },
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
      logger.error(`GSC import failed for website ${websiteId}: ${importErr.message}`);

      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: {
          status: 'FAILED',
          lastSyncStatus: 'FAILED',
          lastError: importErr.message,
        },
      });

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
          errorMessage: importErr.message,
          dateRangeStart: start,
          dateRangeEnd: end,
        },
      });

      throw new BadRequestError(`GSC data import failed: ${importErr.message}`);
    }
  }
}

export const gscDataService = new GSCDataService();
export default gscDataService;
