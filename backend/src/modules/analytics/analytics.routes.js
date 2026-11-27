// backend/src/modules/analytics/analytics.routes.js
// Express Router for querying stored SEO and web analytics.

import { Router } from 'express';
import analyticsController from './analytics.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/tenantContext.js';
import { requirePermission } from '../../middleware/requirePermission.js';

const router = Router();

// Protect all analytics endpoints with authentication and workspace tenancy
router.use('/workspaces/:workspaceId', requireAuth, requireWorkspace);

// Agency Overview (multi-client / multi-website summary)
router.get(
  '/workspaces/:workspaceId/analytics/agency-overview',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getAgencyOverview(req, res, next)
);

// Website Cross-Platform Overview
router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/overview',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getOverview(req, res, next)
);

// GA4 Deep-Dive Routes
router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/ga4/summary',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getGA4Summary(req, res, next)
);

router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/ga4/sources',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getGA4Sources(req, res, next)
);

router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/ga4/landing-pages',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getGA4LandingPages(req, res, next)
);

// GSC Deep-Dive Routes
router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/gsc/summary',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getGSCSummary(req, res, next)
);

router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/gsc/queries',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getGSCQueries(req, res, next)
);

router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/gsc/pages',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getGSCPages(req, res, next)
);

router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/gsc/breakdown',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getGSCBreakdown(req, res, next)
);

router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/gsc/opportunities',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getGSCOpportunities(req, res, next)
);

// Report Summary (same data as the downloadable report, for on-screen viewing)
router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/report-summary',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getReportSummary(req, res, next)
);

// Clarity Summary
router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/clarity/summary',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getClaritySummary(req, res, next)
);

// Month-by-month chart series (one source + metric at a time)
router.get(
  '/workspaces/:workspaceId/analytics/charts/catalogue',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getChartCatalogue(req, res, next)
);

router.get(
  '/workspaces/:workspaceId/websites/:websiteId/analytics/charts/monthly',
  requirePermission('websites.view'),
  (req, res, next) => analyticsController.getMonthlyChart(req, res, next)
);

// Insights page sections (each loads on its own)
for (const [path, handler] of [
  ['visitors', 'getInsightsVisitors'],
  ['forms', 'getInsightsForms'],
  ['ai-visitors', 'getInsightsAiVisitors'],
  ['channels', 'getInsightsChannels'],
  ['pages', 'getInsightsPages'],
]) {
  router.get(
    `/workspaces/:workspaceId/websites/:websiteId/analytics/insights/${path}`,
    requirePermission('websites.view'),
    (req, res, next) => analyticsController[handler](req, res, next)
  );
}

export default router;
