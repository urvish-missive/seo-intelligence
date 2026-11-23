// backend/src/modules/seo-analysis/routes/seo-analysis.routes.js
// Express Router for SEO Analysis Engine, Finding Lifecycle, and Settings endpoints.

import { Router } from 'express';
import seoAnalysisController from '../controllers/seo-analysis.controller.js';
import { requireAuth } from '../../../middleware/auth.js';
import { requireWorkspace } from '../../../middleware/tenantContext.js';
import { requirePermission } from '../../../middleware/requirePermission.js';

const router = Router();

// Protect all routes with authentication and workspace tenancy
router.use('/workspaces/:workspaceId', requireAuth, requireWorkspace);

// 1. Dashboard Overview Stats
router.get(
  '/workspaces/:workspaceId/seo-analysis/overview/:websiteId',
  requirePermission('seo.view'),
  (req, res, next) => seoAnalysisController.getOverview(req, res, next)
);

// 2. Paginated Findings with Filter & Search
router.get(
  '/workspaces/:workspaceId/seo-analysis/findings/:websiteId',
  requirePermission('seo.view'),
  (req, res, next) => seoAnalysisController.getFindings(req, res, next)
);

// 3. Single Finding Details by ID
router.get(
  '/workspaces/:workspaceId/seo-analysis/finding-detail/:findingId',
  requirePermission('seo.view'),
  (req, res, next) => seoAnalysisController.getFindingById(req, res, next)
);

// 4. Opportunities Specialized Endpoint
router.get(
  '/workspaces/:workspaceId/seo-analysis/opportunities/:websiteId',
  requirePermission('seo.view'),
  (req, res, next) => seoAnalysisController.getOpportunities(req, res, next)
);

// 5. Traffic Drops
router.get(
  '/workspaces/:workspaceId/seo-analysis/traffic-drops/:websiteId',
  requirePermission('seo.view'),
  (req, res, next) => seoAnalysisController.getTrafficDrops(req, res, next)
);

// 6. Keyword Opportunities
router.get(
  '/workspaces/:workspaceId/seo-analysis/keyword-opportunities/:websiteId',
  requirePermission('seo.view'),
  (req, res, next) => seoAnalysisController.getKeywordOpportunities(req, res, next)
);

// 7. CTR Issues
router.get(
  '/workspaces/:workspaceId/seo-analysis/ctr-issues/:websiteId',
  requirePermission('seo.view'),
  (req, res, next) => seoAnalysisController.getCtrIssues(req, res, next)
);

// 8. Ranking Movements
router.get(
  '/workspaces/:workspaceId/seo-analysis/ranking-movements/:websiteId',
  requirePermission('seo.view'),
  (req, res, next) => seoAnalysisController.getRankingMovements(req, res, next)
);

// 9. Content Decay
router.get(
  '/workspaces/:workspaceId/seo-analysis/content-decay/:websiteId',
  requirePermission('seo.view'),
  (req, res, next) => seoAnalysisController.getContentDecay(req, res, next)
);

// 10. Behaviour Insights (Clarity)
router.get(
  '/workspaces/:workspaceId/seo-analysis/behaviour-insights/:websiteId',
  requirePermission('seo.view'),
  (req, res, next) => seoAnalysisController.getBehaviourInsights(req, res, next)
);

// 11. Run Analysis (POST)
router.post(
  '/workspaces/:workspaceId/seo-analysis/run/:websiteId',
  requirePermission('seo.analyse'),
  (req, res, next) => seoAnalysisController.runAnalysis(req, res, next)
);

// 12. Update Finding Status (PATCH)
router.patch(
  '/workspaces/:workspaceId/seo-analysis/findings/:findingId/status',
  requirePermission('seo.analyse'),
  (req, res, next) => seoAnalysisController.updateFindingStatus(req, res, next)
);

// 13. Analysis Run History
router.get(
  '/workspaces/:workspaceId/seo-analysis/history/:websiteId',
  requirePermission('seo.view'),
  (req, res, next) => seoAnalysisController.getAnalysisHistory(req, res, next)
);

// 14. Get Settings
router.get(
  '/workspaces/:workspaceId/seo-analysis/settings/:websiteId',
  requirePermission('seo.view'),
  (req, res, next) => seoAnalysisController.getSettings(req, res, next)
);

// 15. Update Settings (PUT)
router.put(
  '/workspaces/:workspaceId/seo-analysis/settings/:websiteId',
  requirePermission('seo.analyse'),
  (req, res, next) => seoAnalysisController.updateSettings(req, res, next)
);

export default router;
