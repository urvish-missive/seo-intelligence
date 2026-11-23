// backend/src/modules/integrations/clarity/clarityImport.service.js
// Service for running preset-based Microsoft Clarity manual data imports and deterministic normalisation into MySQL.

import prisma from '../../../config/database.js';
import { clarityClientService } from './clarityClient.service.js';
import { clarityConnectionService } from './clarityConnection.service.js';
import { NotFoundError, BadRequestError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

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

/**
 * Returns current UTC date formatted as YYYY-MM-DD.
 */
function getCurrentUtcDateString() {
  const now = new Date();
  return now.toISOString().split('T')[0];
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

      // Calculate total rows returned across metric groups
      let totalRowCount = 0;
      for (const group of rawData) {
        if (Array.isArray(group.rows)) {
          totalRowCount += group.rows.length;
        }
      }

      const isTruncated = totalRowCount >= 1000;

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
      await this.normaliseAndPersist({
        websiteId,
        dateStr,
        snapshotId: snapshot.id,
        preset,
        data: rawData,
      });

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
          rowsInserted: totalRowCount,
          apiCallsUsed: 1,
          dateRangeStart: windowStart.toISOString().split('T')[0],
          dateRangeEnd: windowEnd.toISOString().split('T')[0],
        },
      });

      // 10. Audit Log
      await prisma.auditLog.create({
        data: {
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
        },
      });

      logger.info(
        `Clarity data import completed for ${connection.website.domain}. Snapshot: ${snapshot.id}, rows: ${totalRowCount}`
      );

      return {
        success: true,
        snapshotId: snapshot.id,
        preset,
        numOfDays: days,
        rowCount: totalRowCount,
        isTruncated,
        quotaRemaining: quotaInfo.callsRemaining,
        durationMs: Date.now() - startTime,
      };
    } catch (importErr) {
      logger.error(`Clarity import failed for website ${websiteId}: ${importErr.message}`);

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
          integrationType: 'CLARITY',
          status: 'FAILED',
          startedAt: new Date(startTime),
          completedAt: new Date(),
          rowsFetched: 0,
          rowsInserted: 0,
          apiCallsUsed: 1,
          errorMessage: importErr.message,
        },
      });

      throw importErr;
    }
  }

  /**
   * Deterministic normalisation of raw Microsoft Clarity JSON into typed models.
   */
  async normaliseAndPersist({ websiteId, dateStr, snapshotId, preset, data }) {
    if (!Array.isArray(data)) return;

    // Helper to find metric group by name (handles case and whitespace)
    const findGroup = (...names) => {
      const normalized = names.map((n) => n.toLowerCase().replace(/[\s_]/g, ''));
      return data.find((g) => {
        const gName = (g.metricName || '').toLowerCase().replace(/[\s_]/g, '');
        return normalized.includes(gName);
      });
    };

    const getFirst = (grp) => grp?.information?.[0] || grp?.rows?.[0] || {};
    const getList = (grp) =>
      Array.isArray(grp?.information) ? grp.information : (Array.isArray(grp?.rows) ? grp.rows : []);

    // ─── A. OVERVIEW NORMALISATION ──────────────────────────────────────────
    if (preset === 'OVERVIEW' || !preset) {
      const trafficGroup = findGroup('Traffic');
      const rageClickGroup = findGroup('RageClickCount', 'Rage Click Count');
      const deadClickGroup = findGroup('DeadClickCount', 'Dead Click Count');
      const excessiveScrollGroup = findGroup('ExcessiveScroll', 'Excessive Scroll');
      const quickbackGroup = findGroup('QuickbackClick', 'Quick Back', 'Quickback');
      const scriptErrorGroup = findGroup('ScriptErrorCount', 'Script Error Count');
      const errorClickGroup = findGroup('ErrorClickCount', 'Error Click Count');
      const scrollDepthGroup = findGroup('ScrollDepth', 'Scroll Depth');
      const engagementTimeGroup = findGroup('EngagementTime', 'Engagement Time');

      const trafficInfo = getFirst(trafficGroup);
      const sessions = Math.round(
        Number(trafficInfo.totalSessionCount ?? trafficInfo.sessionsCount ?? trafficInfo.value ?? 0)
      );
      const distinctUsers = Math.round(Number(trafficInfo.distinctUserCount ?? 0));
      const botSessions = Math.round(Number(trafficInfo.totalBotSessionCount ?? 0));
      const pagesPerSession = parseFloat(Number(trafficInfo.pagesPerSessionPercentage ?? 0).toFixed(2));

      const rageClicks = Math.round(
        Number(getFirst(rageClickGroup).subTotal ?? getFirst(rageClickGroup).value ?? 0)
      );
      const deadClicks = Math.round(
        Number(getFirst(deadClickGroup).subTotal ?? getFirst(deadClickGroup).value ?? 0)
      );
      const excessiveScrolls = Math.round(
        Number(getFirst(excessiveScrollGroup).subTotal ?? getFirst(excessiveScrollGroup).value ?? 0)
      );
      const quickbacks = Math.round(
        Number(getFirst(quickbackGroup).subTotal ?? getFirst(quickbackGroup).value ?? 0)
      );
      const scriptErrors = Math.round(
        Number(getFirst(scriptErrorGroup).subTotal ?? getFirst(scriptErrorGroup).value ?? 0)
      );
      const errorClicks = Math.round(
        Number(getFirst(errorClickGroup).subTotal ?? getFirst(errorClickGroup).value ?? 0)
      );

      const avgScrollDepth = parseFloat(
        Number(getFirst(scrollDepthGroup).averageScrollDepth ?? getFirst(scrollDepthGroup).value ?? 0).toFixed(2)
      );
      const avgTimeOnPageSec = parseFloat(
        Number(
          getFirst(engagementTimeGroup).activeTime ??
            getFirst(engagementTimeGroup).totalTime ??
            getFirst(engagementTimeGroup).value ??
            0
        ).toFixed(2)
      );

      await prisma.clarityDailyMetric.upsert({
        where: {
          websiteId_date: {
            websiteId,
            date: dateStr,
          },
        },
        update: {
          sessions,
          distinctUsers,
          botSessions,
          pagesPerSession,
          rageClickCount: rageClicks,
          deadClickCount: deadClicks,
          excessiveScrollCount: excessiveScrolls,
          quickbackClickCount: quickbacks,
          scriptErrorCount: scriptErrors,
          errorClickCount: errorClicks,
          avgScrollDepth,
          avgTimeOnPageSec,
        },
        create: {
          websiteId,
          date: dateStr,
          sessions,
          distinctUsers,
          botSessions,
          pagesPerSession,
          rageClickCount: rageClicks,
          deadClickCount: deadClicks,
          excessiveScrollCount: excessiveScrolls,
          quickbackClickCount: quickbacks,
          scriptErrorCount: scriptErrors,
          errorClickCount: errorClicks,
          avgScrollDepth,
          avgTimeOnPageSec,
        },
      });

      // Persist Device breakdown from payload if available
      const deviceGroup = findGroup('Device');
      for (const row of getList(deviceGroup)) {
        const device = (row.name || row.dimension1 || row.device || 'desktop').toLowerCase();
        const devSessions = Math.round(Number(row.sessionsCount ?? row.value ?? 0));
        await prisma.clarityDeviceMetric.upsert({
          where: { websiteId_date_device: { websiteId, date: dateStr, device } },
          update: { sessions: devSessions },
          create: { websiteId, date: dateStr, device, sessions: devSessions },
        }).catch(() => {});
      }

      // Persist Country breakdown from payload if available
      const countryGroup = findGroup('Country');
      for (const row of getList(countryGroup)) {
        const country = (row.name || row.dimension1 || row.country || 'Unknown').substring(0, 100);
        const cSessions = Math.round(Number(row.sessionsCount ?? row.value ?? 0));
        await prisma.clarityCountryMetric.upsert({
          where: { websiteId_date_country: { websiteId, date: dateStr, country } },
          update: { sessions: cSessions },
          create: { websiteId, date: dateStr, country, sessions: cSessions },
        }).catch(() => {});
      }

      // Persist Popular Pages from payload if available
      const popularPages = findGroup('PopularPages', 'PageTitle', 'URL');
      for (const row of getList(popularPages).slice(0, 50)) {
        const page = (row.url || row.name || '/').substring(0, 500);
        const pSessions = Math.round(Number(row.visitsCount ?? row.sessionsCount ?? row.value ?? 0));
        await prisma.clarityPageMetric.upsert({
          where: { websiteId_date_page: { websiteId, date: dateStr, page } },
          update: { sessions: pSessions },
          create: { websiteId, date: dateStr, page, sessions: pSessions },
        }).catch(() => {});
      }
    }

    // ─── B. DEVICE BREAKDOWN (Dedicated Preset) ─────────────────────────────
    if (preset === 'DEVICE') {
      const deviceGroup = findGroup('Device', 'Traffic');
      for (const row of getList(deviceGroup)) {
        const device = (row.name || row.dimension1 || row.device || 'desktop').toLowerCase();
        const devSessions = Math.round(Number(row.sessionsCount ?? row.value ?? 0));

        await prisma.clarityDeviceMetric.upsert({
          where: {
            websiteId_date_device: {
              websiteId,
              date: dateStr,
              device,
            },
          },
          update: { sessions: devSessions },
          create: {
            websiteId,
            date: dateStr,
            device,
            sessions: devSessions,
          },
        }).catch(() => {});
      }
    }

    // ─── C. COUNTRY BREAKDOWN (Dedicated Preset) ────────────────────────────
    if (preset === 'COUNTRY') {
      const countryGroup = findGroup('Country', 'Traffic');
      for (const row of getList(countryGroup)) {
        const country = (row.name || row.dimension1 || row.country || 'Unknown').substring(0, 100);
        const cSessions = Math.round(Number(row.sessionsCount ?? row.value ?? 0));

        await prisma.clarityCountryMetric.upsert({
          where: {
            websiteId_date_country: {
              websiteId,
              date: dateStr,
              country,
            },
          },
          update: { sessions: cSessions },
          create: {
            websiteId,
            date: dateStr,
            country,
            sessions: cSessions,
          },
        }).catch(() => {});
      }
    }

    // ─── D. URL BREAKDOWN (Dedicated Preset) ─────────────────────────────────
    if (preset === 'URL') {
      const popularPages = findGroup('PopularPages', 'Popular Pages', 'Traffic');
      for (const row of getList(popularPages).slice(0, 200)) {
        const page = (row.url || row.name || row.dimension1 || '/').substring(0, 500);
        const pSessions = Math.round(Number(row.visitsCount ?? row.sessionsCount ?? row.value ?? 0));

        await prisma.clarityPageMetric.upsert({
          where: {
            websiteId_date_page: {
              websiteId,
              date: dateStr,
              page,
            },
          },
          update: { sessions: pSessions },
          create: {
            websiteId,
            date: dateStr,
            page,
            sessions: pSessions,
          },
        }).catch(() => {});
      }
    }

    // ─── E. DIMENSION METRICS (General Row Persistence) ─────────────────────
    for (const group of data) {
      if (Array.isArray(group.rows)) {
        for (const row of group.rows.slice(0, 100)) {
          await prisma.clarityDimensionMetric.create({
            data: {
              websiteId,
              snapshotId,
              date: dateStr,
              metricName: group.metricName || 'Unknown',
              dimension1Name: row.dimension1 ? 'dim1' : null,
              dimension1Val: row.dimension1 ? String(row.dimension1).substring(0, 255) : null,
              dimension2Name: row.dimension2 ? 'dim2' : null,
              dimension2Val: row.dimension2 ? String(row.dimension2).substring(0, 255) : null,
              value: parseFloat(Number(row.value || 0).toFixed(4)),
            },
          });
        }
      }
    }
  }
}

export const clarityImportService = new ClarityImportService();
export default clarityImportService;
