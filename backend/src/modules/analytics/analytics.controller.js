// backend/src/modules/analytics/analytics.controller.js
// REST Controller for analytics dashboard data endpoints.

import analyticsDataService from './analyticsData.service.js';
import { reportDataAggregatorService } from '../reports/services/report-data-aggregator.service.js';
import { BadRequestError } from '../../middleware/errorHandler.js';
import { monthlyChartService, getChartCatalogue } from './monthlyChart.service.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate optional YYYY-MM-DD range query params; both or neither. */
function readDateRange(query) {
  const { startDate, endDate } = query;
  if (!startDate && !endDate) return {};
  if (!DATE_RE.test(startDate || '') || !DATE_RE.test(endDate || '')) {
    throw new BadRequestError('startDate and endDate must both be provided as YYYY-MM-DD.');
  }
  if (startDate > endDate) {
    throw new BadRequestError('startDate must be on or before endDate.');
  }
  return { startDate, endDate };
}

export class AnalyticsController {
  /**
   * Everything the downloadable report contains, as JSON for the dashboard:
   * KPIs with period comparison, executive summary, traffic-drop check,
   * keyword opportunities, top queries/pages/sources, Clarity UX and SEO findings.
   */
  async getReportSummary(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { startDate, endDate } = readDateRange(req.query);
      const periodEnd = endDate || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const periodStart = startDate || new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);

      const data = await reportDataAggregatorService.aggregateReportData({
        workspaceId,
        websiteId,
        reportType: 'DASHBOARD',
        periodStart,
        periodEnd,
        includeAiSummary: false,
      });

      // Branding is only needed for rendered files
      const { branding, ...rest } = data;
      res.json({ success: true, data: rest });
    } catch (err) {
      next(err);
    }
  }

  async getOverview(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { startDate, endDate, compare } = req.query;

      const result = await analyticsDataService.getWebsiteOverview(workspaceId, websiteId, {
        startDate,
        endDate,
        compare: compare === 'true',
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getGA4Summary(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { startDate, endDate, compare } = req.query;

      const result = await analyticsDataService.getGA4Summary(workspaceId, websiteId, {
        startDate,
        endDate,
        compare: compare === 'true',
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getGA4Sources(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { startDate, endDate, limit } = req.query;

      const result = await analyticsDataService.getGA4TrafficSources(workspaceId, websiteId, {
        startDate,
        endDate,
        limit,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getGA4LandingPages(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { startDate, endDate, limit, offset, search } = req.query;

      const result = await analyticsDataService.getGA4LandingPages(workspaceId, websiteId, {
        startDate,
        endDate,
        limit,
        offset,
        search,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getGSCSummary(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { startDate, endDate, compare } = req.query;

      const result = await analyticsDataService.getGSCSummary(workspaceId, websiteId, {
        startDate,
        endDate,
        compare: compare === 'true',
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getGSCQueries(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { startDate, endDate, limit, offset, search, minClicks, minImpressions } = req.query;

      const result = await analyticsDataService.getGSCTopQueries(workspaceId, websiteId, {
        startDate,
        endDate,
        limit,
        offset,
        search,
        minClicks,
        minImpressions,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getGSCPages(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { startDate, endDate, limit, offset, search } = req.query;

      const result = await analyticsDataService.getGSCTopPages(workspaceId, websiteId, {
        startDate,
        endDate,
        limit,
        offset,
        search,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getGSCBreakdown(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { dimension, startDate, endDate } = req.query;

      const result = await analyticsDataService.getGSCBreakdown(workspaceId, websiteId, {
        dimension,
        startDate,
        endDate,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getGSCOpportunities(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { startDate, endDate } = req.query;

      const result = await analyticsDataService.getGSCOpportunities(workspaceId, websiteId, {
        startDate,
        endDate,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getClaritySummary(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;

      const result = await analyticsDataService.getClaritySummary(workspaceId, websiteId, readDateRange(req.query));

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  getChartCatalogue(req, res, next) {
    try {
      res.json({ success: true, data: getChartCatalogue() });
    } catch (err) {
      next(err);
    }
  }

  async getMonthlyChart(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { source, metric, segment, segmentValue } = req.query;
      const result = await monthlyChartService.getMonthlySeries(workspaceId, websiteId, {
        source,
        metric,
        segment,
        segmentValue,
        ...readDateRange(req.query),
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getAgencyOverview(req, res, next) {
    try {
      const { workspaceId } = req.params;

      const result = await analyticsDataService.getAgencyOverview(workspaceId, readDateRange(req.query));

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const analyticsController = new AnalyticsController();
export default analyticsController;
