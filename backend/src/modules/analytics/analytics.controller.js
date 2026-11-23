// backend/src/modules/analytics/analytics.controller.js
// REST Controller for analytics dashboard data endpoints.

import analyticsDataService from './analyticsData.service.js';

export class AnalyticsController {
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

      const result = await analyticsDataService.getClaritySummary(workspaceId, websiteId);

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getAgencyOverview(req, res, next) {
    try {
      const { workspaceId } = req.params;

      const result = await analyticsDataService.getAgencyOverview(workspaceId);

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const analyticsController = new AnalyticsController();
export default analyticsController;
