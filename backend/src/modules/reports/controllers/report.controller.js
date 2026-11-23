// backend/src/modules/reports/controllers/report.controller.js
// Request handlers for reports, schedules, templates, branding, and secure downloads.

import { reportService } from '../services/report.service.js';
import {
  createReportSchema,
  previewReportSchema,
  createScheduleSchema,
  updateScheduleSchema,
  brandingSchema,
} from '../validators/report.validator.js';

export class ReportController {
  /**
   * Return supported report templates catalog.
   */
  async getTemplates(req, res, next) {
    try {
      const templates = [
        {
          id: 'MONTHLY_SEO',
          name: 'Monthly SEO Performance Report',
          description: 'Comprehensive executive review across GA4 traffic, GSC search queries, SEO audit findings, and Clarity UX friction.',
          recommendedFrequency: 'MONTHLY',
          supportedFormats: ['PDF', 'EXCEL', 'BOTH'],
          defaultSections: ['Executive Summary', 'Traffic KPIs', 'Top Search Queries', 'Top Landing Pages', 'SEO Audit Findings', 'UX Friction'],
        },
        {
          id: 'WEBSITE_PERFORMANCE',
          name: 'Website Performance & Traffic Report',
          description: 'Holistic cross-platform traffic and acquisition breakdown by channel, source, device, and landing page.',
          recommendedFrequency: 'MONTHLY',
          supportedFormats: ['PDF', 'EXCEL', 'BOTH'],
          defaultSections: ['Executive Summary', 'GA4 Traffic Trends', 'Acquisition Channels', 'Landing Pages'],
        },
        {
          id: 'KEYWORD_OPPORTUNITY',
          name: 'Keyword Opportunity & Rankings Report',
          description: 'Focuses on striking-distance queries (positions 4–20) with high impression volume and clear snippet optimization potential.',
          recommendedFrequency: 'WEEKLY',
          supportedFormats: ['PDF', 'EXCEL', 'BOTH'],
          defaultSections: ['Keyword Striking Distance Opportunities', 'Ranking Trends', 'Meta Optimization Recommendations'],
        },
        {
          id: 'TRAFFIC_DROP',
          name: 'Traffic Drop Investigation Report',
          description: 'Root-cause diagnostic comparison between two periods identifying declining pages, channels, and query drop-offs.',
          recommendedFrequency: 'CUSTOM',
          supportedFormats: ['PDF', 'EXCEL', 'BOTH'],
          defaultSections: ['Drop Magnitude', 'Affected Landing Pages', 'Query Impression Drops', 'Recommended Next Steps'],
        },
        {
          id: 'CLARITY_BEHAVIOUR',
          name: 'Clarity User Behaviour & UX Report',
          description: 'Aggregate visitor friction metrics (dead clicks, rage clicks, quickbacks, and script errors) across key pages.',
          recommendedFrequency: 'MONTHLY',
          supportedFormats: ['PDF', 'EXCEL', 'BOTH'],
          defaultSections: ['Aggregate UX Friction', 'Dead Clicks Hotspots', 'Rage Click Hotspots', 'Script Error Log'],
        },
        {
          id: 'CUSTOM',
          name: 'Custom Tailored SEO Report',
          description: 'Flexible report configuration with selectable sections, custom date ranges, and custom comparison benchmarks.',
          recommendedFrequency: 'CUSTOM',
          supportedFormats: ['PDF', 'EXCEL', 'BOTH'],
          defaultSections: ['Configurable by Administrator'],
        },
      ];

      res.json({ success: true, data: templates });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Preview report aggregation data.
   */
  async previewReport(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const validated = previewReportSchema.parse(req.body);

      const previewData = await reportService.previewReport(workspaceId, req.user, validated);
      res.json({ success: true, data: previewData });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create and trigger report generation.
   */
  async createReport(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const validated = createReportSchema.parse(req.body);

      const report = await reportService.createReport(workspaceId, req.user, validated);
      res.status(201).json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  }

  /**
   * List reports for workspace.
   */
  async getReports(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const result = await reportService.getReports(workspaceId, req.user, req.query);
      res.json({ success: true, data: result.reports, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get single report details.
   */
  async getReportById(req, res, next) {
    try {
      const { workspaceId, reportId } = req.params;
      const report = await reportService.getReportById(workspaceId, req.user, reportId);
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete report.
   */
  async deleteReport(req, res, next) {
    try {
      const { workspaceId, reportId } = req.params;
      const result = await reportService.deleteReport(workspaceId, req.user, reportId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Stream download report file.
   */
  async downloadReport(req, res, next) {
    try {
      const { workspaceId, reportId } = req.params;
      const { format = 'PDF' } = req.query;

      const fileDownload = await reportService.getReportDownloadStream(workspaceId, req.user, reportId, format);

      res.setHeader('Content-Type', fileDownload.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileDownload.downloadFilename}"`);
      if (fileDownload.fileSize) {
        res.setHeader('Content-Length', fileDownload.fileSize);
      }

      fileDownload.stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SCHEDULES
  // ───────────────────────────────────────────────────────────────────────────

  async getSchedules(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const schedules = await reportService.getSchedules(workspaceId, req.user, req.query);
      res.json({ success: true, data: schedules });
    } catch (err) {
      next(err);
    }
  }

  async createSchedule(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const validated = createScheduleSchema.parse(req.body);

      const schedule = await reportService.createSchedule(workspaceId, req.user, validated);
      res.status(201).json({ success: true, data: schedule });
    } catch (err) {
      next(err);
    }
  }

  async toggleSchedule(req, res, next) {
    try {
      const { workspaceId, scheduleId } = req.params;
      const { isActive } = req.body;

      const updated = await reportService.toggleSchedule(workspaceId, req.user, scheduleId, Boolean(isActive));
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  async deleteSchedule(req, res, next) {
    try {
      const { workspaceId, scheduleId } = req.params;
      const result = await reportService.deleteSchedule(workspaceId, req.user, scheduleId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BRANDING
  // ───────────────────────────────────────────────────────────────────────────

  async getBranding(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const branding = await reportService.getBranding(workspaceId);
      res.json({ success: true, data: branding });
    } catch (err) {
      next(err);
    }
  }

  async updateBranding(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const validated = brandingSchema.parse(req.body);

      const branding = await reportService.updateBranding(workspaceId, validated);
      res.json({ success: true, data: branding });
    } catch (err) {
      next(err);
    }
  }
}

export const reportController = new ReportController();
