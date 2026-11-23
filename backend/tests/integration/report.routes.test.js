// backend/tests/integration/report.routes.test.js
// Integration and controller tests for Reporting API endpoints, scheduling, and branding.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { reportController } from '../../src/modules/reports/controllers/report.controller.js';
import { reportService } from '../../src/modules/reports/services/report.service.js';
import { setReportQueue } from '../../src/modules/reports/schedulers/report.queue.js';
import prisma from '../../src/config/database.js';

function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(key, val) {
      this.headers[key] = val;
      return this;
    },
  };
  return res;
}

describe('Report Controller & Service Integration Tests', () => {
  const workspaceId = 'ws-test-rep';
  const mockUser = {
    id: 'user-manager-1',
    email: 'manager@missive.test',
    role: 'admin',
    workspaceId,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setReportQueue({
      add: jest.fn().mockResolvedValue({ id: 'job-mock-1' }),
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      removeRepeatableByKey: jest.fn().mockResolvedValue(true),
    });
  });

  describe('getTemplates', () => {
    it('should return catalog of 6 supported report templates with default sections', async () => {
      const req = { params: { workspaceId }, user: mockUser };
      const res = createMockResponse();
      let nextError = null;

      await reportController.getTemplates(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.data.success).toBe(true);
      expect(res.data.data).toHaveLength(6);

      const templateIds = res.data.data.map(t => t.id);
      expect(templateIds).toContain('MONTHLY_SEO');
      expect(templateIds).toContain('WEBSITE_PERFORMANCE');
      expect(templateIds).toContain('KEYWORD_OPPORTUNITY');
      expect(templateIds).toContain('TRAFFIC_DROP');
      expect(templateIds).toContain('CLARITY_BEHAVIOUR');
      expect(templateIds).toContain('CUSTOM');
    });
  });

  describe('createReport', () => {
    it('should create pending report and enqueue BullMQ job', async () => {
      const mockWebsite = {
        id: 'web-1',
        name: 'Target Store',
        domain: 'store.test',
        workspaceId,
        client: { id: 'cl-1', name: 'Store Client' },
      };

      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue(mockWebsite);
      jest.spyOn(prisma.sEOReport, 'create').mockResolvedValue({
        id: 'rep-created-1',
        workspaceId,
        websiteId: 'web-1',
        clientId: 'cl-1',
        reportType: 'MONTHLY_SEO',
        format: 'PDF',
        status: 'PENDING',
        title: 'Target Store - MONTHLY_SEO Report',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });

      const req = {
        params: { workspaceId },
        user: mockUser,
        body: {
          websiteId: '00000000-0000-0000-0000-000000000001',
          reportType: 'MONTHLY_SEO',
          format: 'PDF',
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
        },
      };
      const res = createMockResponse();
      let nextError = null;

      await reportController.createReport(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.statusCode).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.data.id).toBe('rep-created-1');
      expect(res.data.data.status).toBe('PENDING');
    });

    it('should reject creation when user lacks access to the client website with 403', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue(null);

      const req = {
        params: { workspaceId },
        user: { id: 'user-viewer', role: 'viewer', workspaceId },
        body: {
          websiteId: '00000000-0000-0000-0000-000000000001',
          reportType: 'MONTHLY_SEO',
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
        },
      };
      const res = createMockResponse();
      let nextError = null;

      await reportController.createReport(req, res, (err) => { nextError = err; });

      expect(nextError).toBeDefined();
      expect(nextError.statusCode).toBe(403);
      expect(nextError.message).toContain('Access denied');
    });
  });

  describe('getReports', () => {
    it('should list paginated reports for workspace', async () => {
      const mockReports = [
        {
          id: 'rep-1',
          title: 'Monthly Review',
          status: 'COMPLETED',
          format: 'PDF',
          createdAt: new Date(),
          website: { id: 'w-1', name: 'Web', domain: 'web.test' },
          client: { id: 'c-1', name: 'Client' },
        },
      ];

      jest.spyOn(prisma.sEOReport, 'findMany').mockResolvedValue(mockReports);
      jest.spyOn(prisma.sEOReport, 'count').mockResolvedValue(1);

      const req = {
        params: { workspaceId },
        user: mockUser,
        query: { limit: 10, offset: 0 },
      };
      const res = createMockResponse();
      let nextError = null;

      await reportController.getReports(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.data.success).toBe(true);
      expect(res.data.data).toHaveLength(1);
      expect(res.data.pagination.total).toBe(1);
    });
  });

  describe('deleteReport', () => {
    it('should delete report record from database', async () => {
      const mockReport = {
        id: 'rep-to-del',
        workspaceId,
        websiteId: 'web-1',
        pdfPath: null,
        excelPath: null,
      };

      jest.spyOn(prisma.sEOReport, 'findFirst').mockResolvedValue(mockReport);
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({ id: 'web-1', workspaceId });
      jest.spyOn(prisma.sEOReport, 'delete').mockResolvedValue(mockReport);

      const req = {
        params: { workspaceId, reportId: 'rep-to-del' },
        user: mockUser,
      };
      const res = createMockResponse();
      let nextError = null;

      await reportController.deleteReport(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.data.success).toBe(true);
      expect(prisma.sEOReport.delete).toHaveBeenCalledWith({
        where: { id: 'rep-to-del' },
      });
    });
  });

  describe('Report Schedules', () => {
    it('should create recurring schedule in database and return created record', async () => {
      const mockWebsite = {
        id: 'web-1',
        name: 'Target Store',
        workspaceId,
        client: { id: 'c-1' },
      };

      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue(mockWebsite);
      jest.spyOn(prisma.reportSchedule, 'create').mockResolvedValue({
        id: 'sched-1',
        workspaceId,
        websiteId: 'web-1',
        clientId: 'c-1',
        reportName: 'Monthly Automated Audit',
        frequency: 'MONTHLY',
        cronExpr: '0 9 1 * *',
        isActive: true,
      });

      const req = {
        params: { workspaceId },
        user: mockUser,
        body: {
          websiteId: '00000000-0000-0000-0000-000000000001',
          reportName: 'Monthly Automated Audit',
          reportType: 'MONTHLY_SEO',
          frequency: 'MONTHLY',
          format: 'PDF',
          scheduledTime: '09:00',
        },
      };
      const res = createMockResponse();
      let nextError = null;

      await reportController.createSchedule(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.statusCode).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.data.id).toBe('sched-1');
    });

    it('should toggle schedule active/paused state', async () => {
      const mockSchedule = {
        id: 'sched-toggle',
        workspaceId,
        websiteId: 'web-1',
        clientId: 'c-1',
        cronExpr: '0 9 1 * *',
        timezone: 'UTC',
        isActive: true,
      };

      jest.spyOn(prisma.reportSchedule, 'findFirst').mockResolvedValue(mockSchedule);
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({ id: 'web-1', workspaceId });
      jest.spyOn(prisma.reportSchedule, 'update').mockResolvedValue({
        ...mockSchedule,
        isActive: false,
      });

      const req = {
        params: { workspaceId, scheduleId: 'sched-toggle' },
        user: mockUser,
        body: { isActive: false },
      };
      const res = createMockResponse();
      let nextError = null;

      await reportController.toggleSchedule(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.data.success).toBe(true);
      expect(res.data.data.isActive).toBe(false);
    });
  });

  describe('Agency Branding', () => {
    it('should retrieve default branding when none exists', async () => {
      jest.spyOn(prisma.reportBranding, 'findUnique').mockResolvedValue(null);

      const req = { params: { workspaceId }, user: mockUser };
      const res = createMockResponse();
      let nextError = null;

      await reportController.getBranding(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.data.success).toBe(true);
      expect(res.data.data.agencyName).toBe('Missive Digital Agency');
      expect(res.data.data.brandPrimaryColor).toBe('#4f46e5');
    });

    it('should update workspace branding configuration', async () => {
      const updatedBranding = {
        workspaceId,
        agencyName: 'Custom SEO Studio',
        brandPrimaryColor: '#059669',
        brandSecondaryColor: '#1e293b',
        website: 'https://customstudio.test',
        contactEmail: 'hi@customstudio.test',
        footerText: 'Custom Agency Audit',
      };

      jest.spyOn(prisma.reportBranding, 'upsert').mockResolvedValue(updatedBranding);

      const req = {
        params: { workspaceId },
        user: mockUser,
        body: updatedBranding,
      };
      const res = createMockResponse();
      let nextError = null;

      await reportController.updateBranding(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.data.success).toBe(true);
      expect(res.data.data.agencyName).toBe('Custom SEO Studio');
      expect(res.data.data.brandPrimaryColor).toBe('#059669');
    });
  });
});
