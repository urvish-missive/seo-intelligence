// backend/src/modules/integrations/clarity/clarityData.service.js
// Service for querying locally stored Microsoft Clarity metrics and snapshots from MySQL (100% offline capability).

import prisma from '../../../config/database.js';
import { NotFoundError } from '../../../middleware/errorHandler.js';

export class ClarityDataService {
  /**
   * Get aggregated UX and behavioral friction metrics for a website from local MySQL storage.
   */
  async getClarityOverview(workspaceId, websiteId) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
      include: {
        integrations: {
          where: { integrationType: 'CLARITY' },
          include: {
            clarityConnection: {
              select: {
                id: true,
                projectId: true,
                projectName: true,
                status: true,
                lastSyncAt: true,
                lastValidatedAt: true,
                apiCallsToday: true,
              },
            },
          },
        },
      },
    });

    if (!website) {
      throw new NotFoundError('Website not found in this workspace.');
    }

    // 1. Fetch latest daily metrics
    const dailyMetrics = await prisma.clarityDailyMetric.findMany({
      where: { websiteId },
      orderBy: { date: 'desc' },
      take: 30,
    });

    // Compute aggregated friction totals
    const frictionTotals = dailyMetrics.reduce(
      (acc, row) => {
        acc.sessions += row.sessions;
        acc.deadClicks += row.deadClickCount;
        acc.rageClicks += row.rageClickCount;
        acc.excessiveScrolls += row.excessiveScrollCount;
        acc.quickbacks += row.quickbackClickCount;
        acc.scriptErrors += row.scriptErrorCount;
        acc.errorClicks += row.errorClickCount;
        acc.scrollDepthSum += row.avgScrollDepth;
        acc.timeOnPageSum += row.avgTimeOnPageSec;
        return acc;
      },
      {
        sessions: 0,
        deadClicks: 0,
        rageClicks: 0,
        excessiveScrolls: 0,
        quickbacks: 0,
        scriptErrors: 0,
        errorClicks: 0,
        scrollDepthSum: 0,
        timeOnPageSum: 0,
      }
    );

    const count = dailyMetrics.length || 1;
    const summary = {
      totalSessions: frictionTotals.sessions,
      totalDeadClicks: frictionTotals.deadClicks,
      totalRageClicks: frictionTotals.rageClicks,
      totalExcessiveScrolls: frictionTotals.excessiveScrolls,
      totalQuickbacks: frictionTotals.quickbacks,
      totalScriptErrors: frictionTotals.scriptErrors,
      totalErrorClicks: frictionTotals.errorClicks,
      avgScrollDepth: parseFloat((frictionTotals.scrollDepthSum / count).toFixed(1)),
      avgTimeOnPageSec: parseFloat((frictionTotals.timeOnPageSum / count).toFixed(1)),
    };

    // 2. Fetch device breakdown (latest import date only, so pages/devices are not
    //    repeated once per import day)
    const latestDevice = await prisma.clarityDeviceMetric.findFirst({
      where: { websiteId },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    const deviceMetrics = latestDevice
      ? await prisma.clarityDeviceMetric.findMany({
          where: { websiteId, date: latestDevice.date },
          orderBy: { sessions: 'desc' },
          take: 10,
        })
      : [];

    // 3. Fetch top pages
    const latestPage = await prisma.clarityPageMetric.findFirst({
      where: { websiteId },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    const pageMetrics = latestPage
      ? await prisma.clarityPageMetric.findMany({
          where: { websiteId, date: latestPage.date },
          orderBy: { sessions: 'desc' },
          take: 20,
        })
      : [];

    // 4. Fetch latest snapshots count
    const snapshotsCount = await prisma.clarityImportSnapshot.count({
      where: { websiteId },
    });

    return {
      websiteId,
      domain: website.domain,
      integration: website.integrations[0] || null,
      summary,
      dailyTrend: dailyMetrics,
      deviceBreakdown: deviceMetrics,
      topPages: pageMetrics,
      totalSnapshots: snapshotsCount,
    };
  }

  /**
   * List historical Clarity snapshots for a website.
   */
  async listSnapshots(workspaceId, websiteId, { limit = 20, offset = 0 } = {}) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
    });
    if (!website) {
      throw new NotFoundError('Website not found in this workspace.');
    }

    const [total, snapshots] = await Promise.all([
      prisma.clarityImportSnapshot.count({ where: { websiteId } }),
      prisma.clarityImportSnapshot.findMany({
        where: { websiteId },
        select: {
          id: true,
          clarityConnectionId: true,
          websiteId: true,
          importTimestamp: true,
          requestedNumOfDays: true,
          windowStart: true,
          windowEnd: true,
          preset: true,
          dimensions: true,
          rowCount: true,
          status: true,
          isTruncated: true,
          errorMessage: true,
          createdAt: true,
        },
        orderBy: { importTimestamp: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
    ]);

    return {
      total,
      limit: Number(limit),
      offset: Number(offset),
      snapshots,
    };
  }

  /**
   * Get single snapshot with raw JSON response for debugging or audit inspection.
   */
  async getSnapshotById(workspaceId, websiteId, snapshotId) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
    });
    if (!website) {
      throw new NotFoundError('Website not found in this workspace.');
    }

    const snapshot = await prisma.clarityImportSnapshot.findFirst({
      where: { id: snapshotId, websiteId },
      include: {
        clarityConnection: {
          select: {
            id: true,
            projectId: true,
            projectName: true,
          },
        },
      },
    });

    if (!snapshot) {
      throw new NotFoundError('Clarity import snapshot not found.');
    }

    let parsedJson = null;
    try {
      parsedJson = JSON.parse(snapshot.rawResponseJson);
    } catch {
      parsedJson = snapshot.rawResponseJson;
    }

    return {
      ...snapshot,
      rawResponseJson: undefined,
      rawResponse: parsedJson,
    };
  }
}

export const clarityDataService = new ClarityDataService();
export default clarityDataService;
