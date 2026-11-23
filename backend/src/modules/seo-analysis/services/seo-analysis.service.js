// backend/src/modules/seo-analysis/services/seo-analysis.service.js
// Master SEO Analysis Orchestrator.
// Executes independent analysis engines over stored MySQL data and persists runs and deduplicated findings.

import prisma from '../../../config/database.js';
import { getComparisonDateRanges, parseDate, formatDate } from '../../../utils/analyticsDate.utils.js';
import { TrafficDropEngine } from '../engines/traffic-drop.engine.js';
import { KeywordOpportunityEngine } from '../engines/keyword-opportunity.engine.js';
import { CTRAnalysisEngine } from '../engines/ctr-analysis.engine.js';
import { RankingMovementEngine } from '../engines/ranking-movement.engine.js';
import { LandingPageEngine } from '../engines/landing-page.engine.js';
import { ContentDecayEngine } from '../engines/content-decay.engine.js';
import { BehaviourAnalysisEngine } from '../engines/behaviour-analysis.engine.js';
import { AnomalyDetectionEngine } from '../engines/anomaly-detection.engine.js';
import { seoSettingService } from './seo-setting.service.js';
import { FINDING_STATUSES } from '../rules/analysis-thresholds.js';
import { NotFoundError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

export class SEOAnalysisService {
  /**
   * Run full or partial SEO analysis on a website.
   *
   * @param {string} workspaceId
   * @param {string} websiteId
   * @param {object} options
   */
  async runAnalysis(workspaceId, websiteId, options = {}) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
      include: { client: true },
    });

    if (!website) {
      throw new NotFoundError(`Website with ID ${websiteId} not found in workspace`);
    }

    const {
      startDate,
      endDate,
      analysisType = 'FULL',
    } = options;

    // Default: Last 28 Days vs Preceding 28 Days
    const defaultEnd = new Date();
    defaultEnd.setDate(defaultEnd.getDate() - 1);
    const defaultStart = new Date(defaultEnd);
    defaultStart.setDate(defaultStart.getDate() - 27);

    const startStr = startDate || formatDate(defaultStart);
    const endStr = endDate || formatDate(defaultEnd);
    const dateRanges = getComparisonDateRanges(startStr, endStr);

    // Calculate prior period for content decay (e.g. Days 57 to 84)
    const msPerDay = 24 * 60 * 60 * 1000;
    const prevStartObj = parseDate(dateRanges.previous.startDate);
    const priorEnd = new Date(prevStartObj.getTime() - msPerDay);
    const priorStart = new Date(priorEnd.getTime() - (dateRanges.current.daysCount - 1) * msPerDay);
    const priorRange = {
      startDate: formatDate(priorStart),
      endDate: formatDate(priorEnd),
    };

    // 1. Create Analysis Run record in DB
    const runRecord = await prisma.sEOAnalysisRun.create({
      data: {
        workspaceId,
        clientId: website.clientId,
        websiteId,
        status: 'RUNNING',
        analysisPeriodStart: dateRanges.current.startDate,
        analysisPeriodEnd: dateRanges.current.endDate,
        comparisonPeriodStart: dateRanges.previous.startDate,
        comparisonPeriodEnd: dateRanges.previous.endDate,
        analysisType,
        rulesVersion: '1.0.0',
        startedAt: new Date(),
      },
    });

    logger.info(`[SEOAnalysisService] Started analysis run ${runRecord.id} for website ${website.domain}`);

    try {
      // 2. Fetch Website Settings
      const settings = await seoSettingService.getSettings(workspaceId, websiteId);

      // 3. Query All Required Analytics Data in Parallel
      const [
        gscCurrent,
        gscPrevious,
        ga4Current,
        ga4Previous,
        gscQueriesCurrent,
        gscQueriesPrevious,
        gscPagesCurrent,
        gscPagesPrevious,
        gscPagesPrior,
        ga4PagesCurrent,
        ga4PagesPrevious,
        clarityDaily,
        clarityPages,
        clarityLatestSnapshot,
      ] = await Promise.all([
        // GSC Daily
        prisma.gSCDailyMetric.findMany({
          where: { websiteId, date: { gte: dateRanges.current.startDate, lte: dateRanges.current.endDate } },
          orderBy: { date: 'asc' },
        }),
        prisma.gSCDailyMetric.findMany({
          where: { websiteId, date: { gte: dateRanges.previous.startDate, lte: dateRanges.previous.endDate } },
        }),
        // GA4 Daily
        prisma.gA4DailyMetric.findMany({
          where: { websiteId, date: { gte: dateRanges.current.startDate, lte: dateRanges.current.endDate } },
          orderBy: { date: 'asc' },
        }),
        prisma.gA4DailyMetric.findMany({
          where: { websiteId, date: { gte: dateRanges.previous.startDate, lte: dateRanges.previous.endDate } },
        }),
        // GSC Queries
        prisma.gSCQueryMetric.findMany({
          where: { websiteId, date: { gte: dateRanges.current.startDate, lte: dateRanges.current.endDate } },
        }),
        prisma.gSCQueryMetric.findMany({
          where: { websiteId, date: { gte: dateRanges.previous.startDate, lte: dateRanges.previous.endDate } },
        }),
        // GSC Pages
        prisma.gSCPageMetric.findMany({
          where: { websiteId, date: { gte: dateRanges.current.startDate, lte: dateRanges.current.endDate } },
        }),
        prisma.gSCPageMetric.findMany({
          where: { websiteId, date: { gte: dateRanges.previous.startDate, lte: dateRanges.previous.endDate } },
        }),
        prisma.gSCPageMetric.findMany({
          where: { websiteId, date: { gte: priorRange.startDate, lte: priorRange.endDate } },
        }),
        // GA4 Landing Pages
        prisma.gA4LandingPageMetric.findMany({
          where: { websiteId, date: { gte: dateRanges.current.startDate, lte: dateRanges.current.endDate } },
        }),
        prisma.gA4LandingPageMetric.findMany({
          where: { websiteId, date: { gte: dateRanges.previous.startDate, lte: dateRanges.previous.endDate } },
        }),
        // Clarity Metrics (graceful fallback)
        prisma.clarityDailyMetric ? prisma.clarityDailyMetric.findMany({ where: { websiteId }, take: 7, orderBy: { date: 'desc' } }).catch(() => []) : Promise.resolve([]),
        prisma.clarityPageMetric ? prisma.clarityPageMetric.findMany({ where: { websiteId }, take: 20, orderBy: { sessions: 'desc' } }).catch(() => []) : Promise.resolve([]),
        prisma.clarityImportSnapshot ? prisma.clarityImportSnapshot.findFirst({ where: { websiteId }, orderBy: { importTimestamp: 'desc' } }).catch(() => null) : Promise.resolve(null),
      ]);

      // 4. Initialize Engines with Website Settings
      const engines = {
        trafficDrop: new TrafficDropEngine(settings),
        keywordOpportunity: new KeywordOpportunityEngine(settings),
        ctrAnalysis: new CTRAnalysisEngine(settings),
        rankingMovement: new RankingMovementEngine(settings),
        landingPage: new LandingPageEngine(settings),
        contentDecay: new ContentDecayEngine(settings),
        behaviourAnalysis: new BehaviourAnalysisEngine(settings),
        anomalyDetection: new AnomalyDetectionEngine(settings),
      };

      const enginePayload = {
        workspaceId,
        clientId: website.clientId,
        websiteId,
        dateRange: dateRanges,
        gscCurrent,
        gscPrevious,
        ga4Current,
        ga4Previous,
        gscQueriesCurrent,
        gscQueriesPrevious,
        gscPagesCurrent,
        gscPagesPrevious,
        gscPagesPrior,
        ga4PagesCurrent,
        ga4PagesPrevious,
        clarityDailyMetrics: clarityDaily,
        clarityPageMetrics: clarityPages,
        latestSnapshot: clarityLatestSnapshot,
        gscDaily: gscCurrent,
        ga4Daily: ga4Current,
      };

      // 5. Execute Enabled Engines in Parallel
      const enabled = settings.enabledEngines || {};
      const engineTasks = [];

      if (enabled.trafficDrop !== false) engineTasks.push(engines.trafficDrop.analyze(enginePayload));
      if (enabled.keywordOpportunity !== false) engineTasks.push(engines.keywordOpportunity.analyze(enginePayload));
      if (enabled.ctrAnalysis !== false) engineTasks.push(engines.ctrAnalysis.analyze(enginePayload));
      if (enabled.rankingMovement !== false) engineTasks.push(engines.rankingMovement.analyze(enginePayload));
      if (enabled.landingPage !== false) engineTasks.push(engines.landingPage.analyze(enginePayload));
      if (enabled.contentDecay !== false) engineTasks.push(engines.contentDecay.analyze(enginePayload));
      if (enabled.behaviourAnalysis !== false) engineTasks.push(engines.behaviourAnalysis.analyze(enginePayload));
      if (enabled.anomalyDetection !== false) engineTasks.push(engines.anomalyDetection.analyze(enginePayload));

      const engineResults = await Promise.all(engineTasks);
      const allFindings = engineResults.flat();

      // 6. Persist / Upsert Findings in Database with Lifecycle Handling
      let persistedCount = 0;
      for (const rawFinding of allFindings) {
        const existing = await prisma.sEOFinding.findUnique({
          where: {
            websiteId_fingerprint: {
              websiteId,
              fingerprint: rawFinding.fingerprint,
            },
          },
        });

        if (existing) {
          // If the issue was previously RESOLVED but was detected again -> REOPEN
          let newStatus = existing.status;
          if (existing.status === FINDING_STATUSES.RESOLVED) {
            newStatus = FINDING_STATUSES.REOPENED;
            await prisma.sEOFindingHistory.create({
              data: {
                findingId: existing.id,
                previousStatus: FINDING_STATUSES.RESOLVED,
                newStatus: FINDING_STATUSES.REOPENED,
                note: `Automatically reopened by SEO Analysis Run: issue detected again with ${rawFinding.changePercentage}% delta`,
              },
            }).catch((e) => logger.warn(`Failed to write reopen history: ${e.message}`));
          }

          await prisma.sEOFinding.update({
            where: { id: existing.id },
            data: {
              analysisRunId: runRecord.id,
              title: rawFinding.title,
              description: rawFinding.description,
              severity: rawFinding.severity,
              priority: rawFinding.priority,
              currentValue: rawFinding.currentValue,
              previousValue: rawFinding.previousValue,
              changeValue: rawFinding.changeValue,
              changePercentage: rawFinding.changePercentage,
              evidenceJson: rawFinding.evidenceJson,
              suggestedAction: rawFinding.suggestedAction,
              status: newStatus,
              updatedAt: new Date(),
            },
          });
          persistedCount++;
        } else {
          // Brand new finding
          const created = await prisma.sEOFinding.create({
            data: {
              ...rawFinding,
              analysisRunId: runRecord.id,
              status: FINDING_STATUSES.NEW,
            },
          });

          await prisma.sEOFindingHistory.create({
            data: {
              findingId: created.id,
              previousStatus: 'NONE',
              newStatus: FINDING_STATUSES.NEW,
              note: 'Initial discovery by SEO Analysis Engine',
            },
          }).catch((e) => logger.warn(`Failed to write initial history: ${e.message}`));

          persistedCount++;
        }
      }

      // 7. Mark Analysis Run as COMPLETED
      const completedRun = await prisma.sEOAnalysisRun.update({
        where: { id: runRecord.id },
        data: {
          status: 'COMPLETED',
          findingsCount: persistedCount,
          completedAt: new Date(),
          summaryJson: JSON.stringify({
            totalGenerated: allFindings.length,
            persistedCount,
            dateRange: dateRanges.current,
            comparisonRange: dateRanges.previous,
          }),
        },
      });

      logger.info(
        `[SEOAnalysisService] Completed run ${runRecord.id} for website ${website.domain}: ${persistedCount} findings recorded.`
      );

      return {
        run: completedRun,
        findingsCount: persistedCount,
        findings: allFindings,
      };
    } catch (err) {
      logger.error(`[SEOAnalysisService] Analysis run ${runRecord.id} failed: ${err.message}`);

      await prisma.sEOAnalysisRun.update({
        where: { id: runRecord.id },
        data: {
          status: 'FAILED',
          error: err.message,
          completedAt: new Date(),
        },
      }).catch((e) => logger.warn(`Could not update failed run record: ${e.message}`));

      throw err;
    }
  }
}

export const seoAnalysisService = new SEOAnalysisService();
export default seoAnalysisService;
