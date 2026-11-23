// backend/src/modules/reports/workers/report.worker.js
// BullMQ Background Worker processing asynchronous PDF and Excel generation tasks.

import { Worker } from 'bullmq';
import prisma from '../../../config/database.js';
import { getBullMQConnection } from '../../../queues/queue.config.js';
import { REPORT_QUEUE_NAME } from '../schedulers/report.queue.js';
import { reportDataAggregatorService } from '../services/report-data-aggregator.service.js';
import { pdfReportGenerator } from '../generators/pdf-report.generator.js';
import { excelReportGenerator } from '../generators/excel-report.generator.js';
import logger from '../../../utils/logger.js';

let reportWorker = null;

export function startReportWorker() {
  if (reportWorker) return reportWorker;

  const connection = getBullMQConnection();

  reportWorker = new Worker(
    REPORT_QUEUE_NAME,
    async (job) => {
      const { reportId, isScheduledRun, scheduleId } = job.data;
      const startTime = new Date();

      logger.info(`[Report Worker] Processing job ${job.id} for report ${reportId}`);

      // 1. Fetch report details
      const report = await prisma.sEOReport.findUnique({
        where: { id: reportId },
      });

      if (!report) {
        throw new Error(`Report record ${reportId} not found in database.`);
      }

      // 2. Transition status to GENERATING
      await prisma.sEOReport.update({
        where: { id: reportId },
        data: { status: 'GENERATING' },
      });

      const logRecord = await prisma.reportGenerationLog.create({
        data: {
          reportId,
          status: 'GENERATING',
          startedAt: startTime,
          retryCount: job.attemptsMade || 0,
        },
      });

      try {
        // 3. Aggregate all live data
        const aggregated = await reportDataAggregatorService.aggregateReportData({
          workspaceId: report.workspaceId,
          websiteId: report.websiteId,
          reportType: report.reportType,
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          comparisonStart: report.comparisonStart,
          comparisonEnd: report.comparisonEnd,
          timezone: report.timezone,
          includeAiSummary: (report.configuration?.includeAiSummary) || false,
          configuration: report.configuration || {},
        });

        // 4. Generate Output Formats
        let pdfFilename = null;
        let excelFilename = null;
        let totalSize = 0;

        if (report.format === 'PDF' || report.format === 'BOTH') {
          pdfFilename = `report-${report.id}.pdf`;
          const pdfRes = await pdfReportGenerator.generate(aggregated, pdfFilename);
          totalSize += pdfRes.fileSize;
        }

        if (report.format === 'EXCEL' || report.format === 'BOTH') {
          excelFilename = `report-${report.id}.xlsx`;
          const excelRes = await excelReportGenerator.generate(aggregated, excelFilename);
          totalSize += excelRes.fileSize;
        }

        // 5. Save Report Sections for in-app preview
        await prisma.reportSection.deleteMany({ where: { reportId } });

        const sectionRecords = [
          {
            reportId,
            sectionType: 'EXECUTIVE_SUMMARY',
            title: 'Executive Summary',
            sortOrder: 1,
            content: aggregated.executiveSummary,
          },
          {
            reportId,
            sectionType: 'KPIS',
            title: 'Key Performance Indicators',
            sortOrder: 2,
            content: {
              ga4: aggregated.metrics.ga4.summary,
              gsc: aggregated.metrics.gsc.summary,
            },
          },
          {
            reportId,
            sectionType: 'GSC_QUERIES',
            title: 'Top Search Queries',
            sortOrder: 3,
            content: { queries: aggregated.metrics.gsc.queries.slice(0, 20) },
          },
          {
            reportId,
            sectionType: 'KEYWORD_OPPORTUNITIES',
            title: 'Keyword Opportunities',
            sortOrder: 4,
            content: { opportunities: aggregated.metrics.gsc.opportunities },
          },
          {
            reportId,
            sectionType: 'SEO_FINDINGS',
            title: 'SEO Audit Findings',
            sortOrder: 5,
            content: { findings: aggregated.metrics.seoFindings },
          },
        ];

        await prisma.reportSection.createMany({ data: sectionRecords });

        // 6. Complete Report Record
        await prisma.sEOReport.update({
          where: { id: reportId },
          data: {
            status: 'COMPLETED',
            pdfPath: pdfFilename,
            excelPath: excelFilename,
            fileSize: totalSize,
            generatedAt: new Date(),
            aiSummary: aggregated.executiveSummary?.text || null,
            errorMessage: null,
          },
        });

        await prisma.reportGenerationLog.update({
          where: { id: logRecord.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });

        if (isScheduledRun && scheduleId) {
          await prisma.reportHistory.create({
            data: {
              scheduleId,
              reportId,
              status: 'COMPLETED',
              startedAt: startTime,
              completedAt: new Date(),
            },
          });

          await prisma.reportSchedule.update({
            where: { id: scheduleId },
            data: { lastRunAt: new Date() },
          });
        }

        logger.info(`[Report Worker] Successfully completed report ${reportId}`);
        return { success: true, reportId };
      } catch (err) {
        logger.error(`[Report Worker] Failed generating report ${reportId}: ${err.message}`);

        await prisma.sEOReport.update({
          where: { id: reportId },
          data: {
            status: 'FAILED',
            errorMessage: err.message,
          },
        });

        await prisma.reportGenerationLog.update({
          where: { id: logRecord.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: err.message,
          },
        });

        if (isScheduledRun && scheduleId) {
          await prisma.reportHistory.create({
            data: {
              scheduleId,
              reportId,
              status: 'FAILED',
              startedAt: startTime,
              completedAt: new Date(),
              errorMessage: err.message,
            },
          });
        }

        throw err;
      }
    },
    {
      connection,
      concurrency: 2,
    }
  );

  reportWorker.on('failed', (job, err) => {
    logger.warn(`Report generation job ${job?.id} failed: ${err.message}`);
  });

  return reportWorker;
}

export async function stopReportWorker() {
  if (reportWorker) {
    await reportWorker.close();
    reportWorker = null;
    logger.info('[ReportWorker] BullMQ Report Worker gracefully closed');
  }
}
