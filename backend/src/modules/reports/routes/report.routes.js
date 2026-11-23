// backend/src/modules/reports/routes/report.routes.js
// Express API routing for reports, schedules, templates, branding, and downloads.

import { Router } from 'express';
import { reportController } from '../controllers/report.controller.js';
import { authenticate } from '../../../middleware/auth.js';
import { requireWorkspaceAccess } from '../../../middleware/tenantContext.js';
import { requirePermission } from '../../../middleware/rbac.js';

const router = Router({ mergeParams: true });

// All report endpoints require valid JWT authentication and workspace membership
router.use(authenticate);
router.use(requireWorkspaceAccess);

// Templates & Preview
router.get('/templates', requirePermission('reports.view'), (req, res, next) =>
  reportController.getTemplates(req, res, next)
);

router.post('/preview', requirePermission('reports.view'), (req, res, next) =>
  reportController.previewReport(req, res, next)
);

// Reports CRUD & Execution
router.post('/', requirePermission('reports.create'), (req, res, next) =>
  reportController.createReport(req, res, next)
);

router.get('/', requirePermission('reports.view'), (req, res, next) =>
  reportController.getReports(req, res, next)
);

router.get('/:reportId', requirePermission('reports.view'), (req, res, next) =>
  reportController.getReportById(req, res, next)
);

router.delete('/:reportId', requirePermission('reports.create'), (req, res, next) =>
  reportController.deleteReport(req, res, next)
);

router.get('/:reportId/download', requirePermission('reports.export'), (req, res, next) =>
  reportController.downloadReport(req, res, next)
);

// Report Schedules
router.get('/schedules/all', requirePermission('reports.view'), (req, res, next) =>
  reportController.getSchedules(req, res, next)
);

router.post('/schedules', requirePermission('reports.schedule'), (req, res, next) =>
  reportController.createSchedule(req, res, next)
);

router.patch('/schedules/:scheduleId/toggle', requirePermission('reports.schedule'), (req, res, next) =>
  reportController.toggleSchedule(req, res, next)
);

router.delete('/schedules/:scheduleId', requirePermission('reports.schedule'), (req, res, next) =>
  reportController.deleteSchedule(req, res, next)
);

// Agency Branding Settings
router.get('/branding/settings', requirePermission('reports.view'), (req, res, next) =>
  reportController.getBranding(req, res, next)
);

router.put('/branding/settings', requirePermission('reports.schedule'), (req, res, next) =>
  reportController.updateBranding(req, res, next)
);

export default router;
