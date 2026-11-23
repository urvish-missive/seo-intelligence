// backend/src/modules/reports/services/report.service.js
// Core business service for managing reports, schedules, branding, and generation lifecycle.

import prisma from '../../../config/database.js';
import { reportStorageService } from './report-storage.service.js';
import { reportDataAggregatorService } from './report-data-aggregator.service.js';
import { addReportJob, registerRepeatableSchedule, removeRepeatableSchedule } from '../schedulers/report.queue.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

export class ReportService {
  /**
   * Helper to verify user access to target website within workspace.
   */
  async verifyWebsiteAccess(workspaceId, websiteId, user) {
    const isGlobalAdmin = ['super_admin', 'admin', 'SUPER_ADMIN', 'ADMIN'].includes(user?.role);

    const where = {
      id: websiteId,
      workspaceId,
      ...(!isGlobalAdmin && user?.id
        ? {
            client: {
              members: {
                some: { userId: user.id },
              },
            },
          }
        : {}),
    };

    const website = await prisma.website.findFirst({
      where,
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    if (!website) {
      throw new ForbiddenError('Access denied: You do not have permission to access this website or client.');
    }

    return website;
  }

  /**
   * Create and trigger immediate background report generation.
   */
  async createReport(workspaceId, user, payload) {
    const website = await this.verifyWebsiteAccess(workspaceId, payload.websiteId, user);

    const reportTitle = payload.title || `${website.name} - ${payload.reportType} Report`;

    const report = await prisma.sEOReport.create({
      data: {
        workspaceId,
        websiteId: website.id,
        clientId: website.client.id,
        reportType: payload.reportType,
        format: payload.format || 'PDF',
        status: 'PENDING',
        title: reportTitle,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        comparisonStart: payload.comparisonStart,
        comparisonEnd: payload.comparisonEnd,
        timezone: payload.timezone || 'UTC',
        configuration: {
          includeAiSummary: payload.includeAiSummary || false,
          ...(payload.configuration || {}),
        },
        generatedBy: user?.id,
      },
    });

    // Enqueue job in BullMQ queue
    await addReportJob({
      reportId: report.id,
      workspaceId,
      websiteId: website.id,
    });

    return report;
  }

  /**
   * Preview aggregated report dataset before generating.
   */
  async previewReport(workspaceId, user, payload) {
    await this.verifyWebsiteAccess(workspaceId, payload.websiteId, user);

    return reportDataAggregatorService.aggregateReportData({
      workspaceId,
      websiteId: payload.websiteId,
      reportType: payload.reportType,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      comparisonStart: payload.comparisonStart,
      comparisonEnd: payload.comparisonEnd,
      timezone: payload.timezone || 'UTC',
      includeAiSummary: false,
    });
  }

  /**
   * List reports for workspace with filtering and pagination.
   */
  async getReports(workspaceId, user, query = {}) {
    const { websiteId, clientId, reportType, status, limit = 20, offset = 0 } = query;

    const where = { workspaceId };

    if (websiteId) where.websiteId = websiteId;
    if (clientId) where.clientId = clientId;
    if (reportType) where.reportType = reportType;
    if (status) where.status = status;

    // Non-admin scoping
    const isGlobalAdmin = ['super_admin', 'admin', 'SUPER_ADMIN', 'ADMIN'].includes(user?.role);
    if (!isGlobalAdmin && user?.id) {
      where.client = {
        members: { some: { userId: user.id } },
      };
    }

    const [reports, total] = await Promise.all([
      prisma.sEOReport.findMany({
        where,
        take: Number(limit),
        skip: Number(offset),
        orderBy: { createdAt: 'desc' },
        include: {
          website: { select: { id: true, name: true, domain: true } },
          client: { select: { id: true, name: true } },
        },
      }),
      prisma.sEOReport.count({ where }),
    ]);

    return {
      reports,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    };
  }

  /**
   * Get single report details by ID including sections.
   */
  async getReportById(workspaceId, user, reportId) {
    const report = await prisma.sEOReport.findFirst({
      where: { id: reportId, workspaceId },
      include: {
        website: { select: { id: true, name: true, domain: true } },
        client: { select: { id: true, name: true } },
        sections: { orderBy: { sortOrder: 'asc' } },
        generationLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!report) {
      throw new NotFoundError('Report not found in this workspace.');
    }

    await this.verifyWebsiteAccess(workspaceId, report.websiteId, user);
    return report;
  }

  /**
   * Delete report record and associated storage files.
   */
  async deleteReport(workspaceId, user, reportId) {
    const report = await this.getReportById(workspaceId, user, reportId);

    // Delete files from storage
    if (report.pdfPath) reportStorageService.deleteFile(report.pdfPath);
    if (report.excelPath) reportStorageService.deleteFile(report.excelPath);

    await prisma.sEOReport.delete({
      where: { id: reportId },
    });

    return { success: true, message: 'Report deleted successfully.' };
  }

  /**
   * Provide authenticated read stream for report downloading.
   */
  async getReportDownloadStream(workspaceId, user, reportId, requestedFormat = 'PDF') {
    const report = await this.getReportById(workspaceId, user, reportId);

    if (report.status !== 'COMPLETED') {
      throw new BadRequestError(`Report cannot be downloaded because its status is ${report.status}.`);
    }

    const format = requestedFormat.toUpperCase();
    let filename = null;
    let contentType = null;

    if (format === 'PDF') {
      filename = report.pdfPath;
      contentType = 'application/pdf';
    } else if (format === 'EXCEL' || format === 'XLSX') {
      filename = report.excelPath;
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      throw new BadRequestError('Invalid download format requested. Must be PDF or EXCEL.');
    }

    if (!filename) {
      throw new NotFoundError(`No ${format} file exists for this report.`);
    }

    const stream = reportStorageService.createReadStream(filename);
    const stats = reportStorageService.getFileStats(filename);

    return {
      stream,
      filename,
      contentType,
      fileSize: stats ? stats.size : null,
      downloadFilename: `${report.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format === 'PDF' ? 'pdf' : 'xlsx'}`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // REPORT SCHEDULES
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create recurring scheduled report.
   */
  async createSchedule(workspaceId, user, payload) {
    const website = await this.verifyWebsiteAccess(workspaceId, payload.websiteId, user);

    // Build cron expression based on frequency and time
    const [hour, minute] = (payload.scheduledTime || '09:00').split(':');
    let cronExpr = '0 9 1 * *'; // Default 1st of month at 9:00

    if (payload.frequency === 'WEEKLY') {
      const day = payload.dayOfWeek !== undefined ? payload.dayOfWeek : 1; // Default Monday
      cronExpr = `${minute} ${hour} * * ${day}`;
    } else if (payload.frequency === 'MONTHLY') {
      const day = payload.dayOfMonth !== undefined ? payload.dayOfMonth : 1;
      cronExpr = `${minute} ${hour} ${day} * *`;
    } else if (payload.frequency === 'QUARTERLY') {
      cronExpr = `${minute} ${hour} 1 1,4,7,10 *`;
    }

    const schedule = await prisma.reportSchedule.create({
      data: {
        workspaceId,
        websiteId: website.id,
        clientId: website.client.id,
        reportName: payload.reportName,
        reportType: payload.reportType,
        format: payload.format || 'PDF',
        frequency: payload.frequency,
        cronExpr,
        dayOfMonth: payload.dayOfMonth,
        dayOfWeek: payload.dayOfWeek,
        scheduledTime: payload.scheduledTime || '09:00',
        timezone: payload.timezone || 'UTC',
        recipients: payload.recipients || [],
        isActive: payload.isActive ?? true,
        configuration: payload.configuration || {},
        createdBy: user?.id,
      },
      include: {
        website: { select: { id: true, name: true, domain: true } },
        client: { select: { id: true, name: true } },
      },
    });

    if (schedule.isActive) {
      await registerRepeatableSchedule({
        scheduleId: schedule.id,
        cronExpr: schedule.cronExpr,
        timezone: schedule.timezone,
        payload: {
          scheduleId: schedule.id,
          workspaceId,
          websiteId: website.id,
          clientId: website.client.id,
          reportType: schedule.reportType,
          format: schedule.format,
          configuration: schedule.configuration,
        },
      });
    }

    return schedule;
  }

  /**
   * List schedules for workspace.
   */
  async getSchedules(workspaceId, user, query = {}) {
    const { websiteId, limit = 50, offset = 0 } = query;
    const where = { workspaceId };
    if (websiteId) where.websiteId = websiteId;

    return prisma.reportSchedule.findMany({
      where,
      take: Number(limit),
      skip: Number(offset),
      orderBy: { createdAt: 'desc' },
      include: {
        website: { select: { id: true, name: true, domain: true } },
        client: { select: { id: true, name: true } },
        history: { take: 3, orderBy: { createdAt: 'desc' } },
      },
    });
  }

  /**
   * Toggle pause/resume on schedule.
   */
  async toggleSchedule(workspaceId, user, scheduleId, isActive) {
    const schedule = await prisma.reportSchedule.findFirst({
      where: { id: scheduleId, workspaceId },
    });

    if (!schedule) {
      throw new NotFoundError('Report schedule not found.');
    }

    await this.verifyWebsiteAccess(workspaceId, schedule.websiteId, user);

    const updated = await prisma.reportSchedule.update({
      where: { id: scheduleId },
      data: { isActive },
    });

    if (isActive) {
      await registerRepeatableSchedule({
        scheduleId: schedule.id,
        cronExpr: schedule.cronExpr,
        timezone: schedule.timezone,
        payload: {
          scheduleId: schedule.id,
          workspaceId,
          websiteId: schedule.websiteId,
          clientId: schedule.clientId,
          reportType: schedule.reportType,
          format: schedule.format,
          configuration: schedule.configuration,
        },
      });
    } else {
      await removeRepeatableSchedule(scheduleId);
    }

    return updated;
  }

  /**
   * Delete schedule.
   */
  async deleteSchedule(workspaceId, user, scheduleId) {
    const schedule = await prisma.reportSchedule.findFirst({
      where: { id: scheduleId, workspaceId },
    });

    if (!schedule) {
      throw new NotFoundError('Report schedule not found.');
    }

    await this.verifyWebsiteAccess(workspaceId, schedule.websiteId, user);
    await removeRepeatableSchedule(scheduleId);

    await prisma.reportSchedule.delete({
      where: { id: scheduleId },
    });

    return { success: true, message: 'Report schedule deleted.' };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BRANDING SETTINGS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get branding settings for workspace.
   */
  async getBranding(workspaceId) {
    let branding = await prisma.reportBranding.findUnique({
      where: { workspaceId },
    });

    if (!branding) {
      branding = {
        workspaceId,
        agencyName: 'Missive Digital Agency',
        logoStorageKey: null,
        brandPrimaryColor: '#4f46e5',
        brandSecondaryColor: '#0f172a',
        website: 'https://missive.digital',
        contactEmail: 'reports@missive.digital',
        footerText: 'Confidential Performance Audit · Prepared for Client',
      };
    }

    return branding;
  }

  /**
   * Upsert branding settings.
   */
  async updateBranding(workspaceId, payload) {
    return prisma.reportBranding.upsert({
      where: { workspaceId },
      update: {
        agencyName: payload.agencyName,
        logoStorageKey: payload.logoStorageKey,
        brandPrimaryColor: payload.brandPrimaryColor || '#4f46e5',
        brandSecondaryColor: payload.brandSecondaryColor || '#0f172a',
        website: payload.website,
        contactEmail: payload.contactEmail,
        footerText: payload.footerText,
      },
      create: {
        workspaceId,
        agencyName: payload.agencyName,
        logoStorageKey: payload.logoStorageKey,
        brandPrimaryColor: payload.brandPrimaryColor || '#4f46e5',
        brandSecondaryColor: payload.brandSecondaryColor || '#0f172a',
        website: payload.website,
        contactEmail: payload.contactEmail,
        footerText: payload.footerText,
      },
    });
  }
}

export const reportService = new ReportService();
