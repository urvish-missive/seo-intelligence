// backend/src/modules/integrations/ga4/ga4Data.service.js
// Service for importing and persisting Google Analytics 4 performance data into MySQL.

import GoogleClientFactory from '../google/googleClient.factory.js';
import prisma from '../../../config/database.js';
import { NotFoundError, BadRequestError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';
import { safeAuditLog } from '../../../utils/safeAuditLog.js';

/**
 * Convert GA4 date format (YYYYMMDD) to ISO format (YYYY-MM-DD).
 */
function formatGA4Date(rawDate) {
  if (!rawDate || rawDate.length !== 8) return rawDate;
  return `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
}

/**
 * Get date N days ago as YYYY-MM-DD.
 */
function getDaysAgoDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export class GA4DataService {
  /**
   * Import GA4 data for a specific website across a date range.
   */
  async importGA4Data({ workspaceId, websiteId, startDate, endDate, user }) {
    const start = startDate || getDaysAgoDate(30);
    const end = endDate || getDaysAgoDate(1); // GA4 data typically finalized up to yesterday

    // 1. Fetch connection details
    const connection = await prisma.integrationConnection.findFirst({
      where: {
        websiteId,
        workspaceId,
        integrationType: 'GA4',
      },
      include: {
        googleAccount: true,
        website: true,
      },
    });

    if (!connection || !connection.googleAccount) {
      throw new NotFoundError('GA4 is not connected to this website.');
    }

    if (!connection.selectedProperty) {
      throw new BadRequestError('No GA4 property is associated with this website.');
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
      const dataClient = await GoogleClientFactory.getAnalyticsDataClient(connection.googleAccount);
      const propertyPath = connection.selectedProperty.startsWith('properties/')
        ? connection.selectedProperty
        : `properties/${connection.selectedProperty}`;

      // ─── 1. Daily Overview Report ─────────────────────────────────────────
      apiCallsUsed++;
      const dailyResponse = await dataClient.properties.runReport({
        property: propertyPath,
        requestBody: {
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'newUsers' },
            { name: 'activeUsers' },
            { name: 'engagedSessions' },
            { name: 'engagementRate' },
            { name: 'averageSessionDuration' },
            { name: 'bounceRate' },
            { name: 'eventCount' },
            { name: 'conversions' },
            { name: 'screenPageViews' },
          ],
        },
      });

      // ─── 1b. Organic Sessions Query ──────────────────────────────────────
      apiCallsUsed++;
      const organicResponse = await dataClient.properties.runReport({
        property: propertyPath,
        requestBody: {
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: 'date' }],
          metrics: [{ name: 'sessions' }],
          dimensionFilter: {
            filter: {
              fieldName: 'sessionDefaultChannelGroup',
              stringFilter: {
                matchType: 'EXACT',
                value: 'Organic Search',
              },
            },
          },
        },
      });

      const organicMap = new Map();
      (organicResponse.data.rows || []).forEach((row) => {
        const d = formatGA4Date(row.dimensionValues[0]?.value);
        const orgSessions = parseInt(row.metricValues[0]?.value || '0', 10);
        organicMap.set(d, orgSessions);
      });

      const dailyRows = dailyResponse.data.rows || [];
      rowsFetched += dailyRows.length;

      for (const row of dailyRows) {
        const dateStr = formatGA4Date(row.dimensionValues[0]?.value);
        const mv = row.metricValues;

        await prisma.gA4DailyMetric.upsert({
          where: {
            websiteId_date: {
              websiteId,
              date: dateStr,
            },
          },
          update: {
            sessions: parseInt(mv[0]?.value || '0', 10),
            totalUsers: parseInt(mv[1]?.value || '0', 10),
            newUsers: parseInt(mv[2]?.value || '0', 10),
            activeUsers: parseInt(mv[3]?.value || '0', 10),
            engagedSessions: parseInt(mv[4]?.value || '0', 10),
            engagementRate: parseFloat(mv[5]?.value || '0'),
            avgEngagementTimeSec: parseFloat(mv[6]?.value || '0'),
            bounceRate: parseFloat(mv[7]?.value || '0'),
            eventCount: parseInt(mv[8]?.value || '0', 10),
            conversions: parseInt(mv[9]?.value || '0', 10),
            screenPageViews: parseInt(mv[10]?.value || '0', 10),
            organicSessions: organicMap.get(dateStr) || 0,
          },
          create: {
            websiteId,
            date: dateStr,
            sessions: parseInt(mv[0]?.value || '0', 10),
            totalUsers: parseInt(mv[1]?.value || '0', 10),
            newUsers: parseInt(mv[2]?.value || '0', 10),
            activeUsers: parseInt(mv[3]?.value || '0', 10),
            engagedSessions: parseInt(mv[4]?.value || '0', 10),
            engagementRate: parseFloat(mv[5]?.value || '0'),
            avgEngagementTimeSec: parseFloat(mv[6]?.value || '0'),
            bounceRate: parseFloat(mv[7]?.value || '0'),
            eventCount: parseInt(mv[8]?.value || '0', 10),
            conversions: parseInt(mv[9]?.value || '0', 10),
            screenPageViews: parseInt(mv[10]?.value || '0', 10),
            organicSessions: organicMap.get(dateStr) || 0,
          },
        });
        rowsInserted++;
      }

      // ─── 2. Landing Pages Report ─────────────────────────────────────────
      apiCallsUsed++;
      const landingResponse = await dataClient.properties.runReport({
        property: propertyPath,
        requestBody: {
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: 'date' }, { name: 'landingPagePlusQueryString' }],
          metrics: [
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'newUsers' },
            { name: 'engagedSessions' },
            { name: 'engagementRate' },
            { name: 'averageSessionDuration' },
            { name: 'conversions' },
            { name: 'bounceRate' },
            { name: 'screenPageViews' },
          ],
          limit: 1000,
        },
      });

      const landingRows = landingResponse.data.rows || [];
      rowsFetched += landingRows.length;

      for (const row of landingRows) {
        const dateStr = formatGA4Date(row.dimensionValues[0]?.value);
        const landingPage = (row.dimensionValues[1]?.value || '/').substring(0, 1000);
        const mv = row.metricValues;

        await prisma.gA4LandingPageMetric.upsert({
          where: {
            websiteId_date_landingPage: {
              websiteId,
              date: dateStr,
              landingPage,
            },
          },
          update: {
            sessions: parseInt(mv[0]?.value || '0', 10),
            users: parseInt(mv[1]?.value || '0', 10),
            newUsers: parseInt(mv[2]?.value || '0', 10),
            engagedSessions: parseInt(mv[3]?.value || '0', 10),
            engagementRate: parseFloat(mv[4]?.value || '0'),
            avgEngagementTimeSec: parseFloat(mv[5]?.value || '0'),
            conversions: parseInt(mv[6]?.value || '0', 10),
            bounceRate: parseFloat(mv[7]?.value || '0'),
            screenPageViews: parseInt(mv[8]?.value || '0', 10),
          },
          create: {
            websiteId,
            date: dateStr,
            landingPage,
            sessions: parseInt(mv[0]?.value || '0', 10),
            users: parseInt(mv[1]?.value || '0', 10),
            newUsers: parseInt(mv[2]?.value || '0', 10),
            engagedSessions: parseInt(mv[3]?.value || '0', 10),
            engagementRate: parseFloat(mv[4]?.value || '0'),
            avgEngagementTimeSec: parseFloat(mv[5]?.value || '0'),
            conversions: parseInt(mv[6]?.value || '0', 10),
            bounceRate: parseFloat(mv[7]?.value || '0'),
            screenPageViews: parseInt(mv[8]?.value || '0', 10),
          },
        });
        rowsInserted++;
      }

      // ─── 3. Traffic Sources Report ───────────────────────────────────────
      apiCallsUsed++;
      const sourceResponse = await dataClient.properties.runReport({
        property: propertyPath,
        requestBody: {
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: 'date' }, { name: 'sessionSource' }, { name: 'sessionMedium' }],
          metrics: [
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'newUsers' },
            { name: 'conversions' },
            { name: 'engagedSessions' },
          ],
          limit: 1000,
        },
      });

      const sourceRows = sourceResponse.data.rows || [];
      rowsFetched += sourceRows.length;

      for (const row of sourceRows) {
        const dateStr = formatGA4Date(row.dimensionValues[0]?.value);
        const source = (row.dimensionValues[1]?.value || '(direct)').substring(0, 255);
        const medium = (row.dimensionValues[2]?.value || '(none)').substring(0, 255);
        const mv = row.metricValues;

        await prisma.gA4TrafficSourceMetric.upsert({
          where: {
            websiteId_date_source_medium: {
              websiteId,
              date: dateStr,
              source,
              medium,
            },
          },
          update: {
            sessions: parseInt(mv[0]?.value || '0', 10),
            users: parseInt(mv[1]?.value || '0', 10),
            newUsers: parseInt(mv[2]?.value || '0', 10),
            conversions: parseInt(mv[3]?.value || '0', 10),
            engagedSessions: parseInt(mv[4]?.value || '0', 10),
          },
          create: {
            websiteId,
            date: dateStr,
            source,
            medium,
            sessions: parseInt(mv[0]?.value || '0', 10),
            users: parseInt(mv[1]?.value || '0', 10),
            newUsers: parseInt(mv[2]?.value || '0', 10),
            conversions: parseInt(mv[3]?.value || '0', 10),
            engagedSessions: parseInt(mv[4]?.value || '0', 10),
          },
        });
        rowsInserted++;
      }

      // ─── 4. Device Categories ────────────────────────────────────────────
      apiCallsUsed++;
      const deviceResponse = await dataClient.properties.runReport({
        property: propertyPath,
        requestBody: {
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: 'date' }, { name: 'deviceCategory' }],
          metrics: [
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'conversions' },
            { name: 'engagementRate' },
          ],
        },
      });

      const deviceRows = deviceResponse.data.rows || [];
      rowsFetched += deviceRows.length;

      for (const row of deviceRows) {
        const dateStr = formatGA4Date(row.dimensionValues[0]?.value);
        const deviceCategory = row.dimensionValues[1]?.value || 'desktop';
        const mv = row.metricValues;

        await prisma.gA4DeviceMetric.upsert({
          where: {
            websiteId_date_deviceCategory: {
              websiteId,
              date: dateStr,
              deviceCategory,
            },
          },
          update: {
            sessions: parseInt(mv[0]?.value || '0', 10),
            users: parseInt(mv[1]?.value || '0', 10),
            conversions: parseInt(mv[2]?.value || '0', 10),
            engagementRate: parseFloat(mv[3]?.value || '0'),
          },
          create: {
            websiteId,
            date: dateStr,
            deviceCategory,
            sessions: parseInt(mv[0]?.value || '0', 10),
            users: parseInt(mv[1]?.value || '0', 10),
            conversions: parseInt(mv[2]?.value || '0', 10),
            engagementRate: parseFloat(mv[3]?.value || '0'),
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
          integrationType: 'GA4',
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
      await safeAuditLog({
        workspaceId,
        userId: user?.id || null,
        action: 'integration.ga4_data_imported',
        entityType: 'Website',
        entityId: websiteId,
        metadata: {
          startDate: start,
          endDate: end,
          rowsFetched,
          rowsInserted,
        },
      });

      logger.info(
        `GA4 data import completed for website ${connection.website.domain}. Rows fetched: ${rowsFetched}, inserted: ${rowsInserted}`
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
      logger.error(`GA4 import failed for website ${websiteId}: ${importErr.message}`);

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
          integrationType: 'GA4',
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

      throw new BadRequestError(`GA4 data import failed: ${importErr.message}`);
    }
  }
}

export const ga4DataService = new GA4DataService();
export default ga4DataService;
