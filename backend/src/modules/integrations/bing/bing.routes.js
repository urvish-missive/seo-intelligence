// backend/src/modules/integrations/bing/bing.routes.js
// Bing Webmaster Tools: list sites for an API key, connect, import, disconnect.

import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireWorkspaceAccess } from '../../../middleware/tenantIsolation.js';
import { bingService } from './bing.service.js';
import { syncOrchestratorService } from '../../../services/sync/syncOrchestrator.service.js';

const router = Router();
const base = '/workspaces/:workspaceId/websites/:websiteId/integrations/bing';
const wrap = (fn) => async (req, res, next) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (err) {
    next(err);
  }
};
const guard = (permission) => [authenticate, requireWorkspaceAccess, requirePermission(permission)];

// Connection status for the website page
router.get(base, ...guard('integrations.view'), wrap((req) => bingService.status(req.params.workspaceId, req.params.websiteId)));

// Sites an API key can access (POST so the key never appears in a URL or access log)
router.post(
  `${base}/sites`,
  ...guard('integrations.manage'),
  wrap((req) => bingService.listSites(req.params.workspaceId, req.params.websiteId, req.body?.apiKey))
);

router.post(
  `${base}/connect`,
  ...guard('integrations.manage'),
  wrap((req) =>
    bingService.connect(req.params.workspaceId, req.params.websiteId, { apiKey: req.body?.apiKey, siteUrl: req.body?.siteUrl }, req.user)
  )
);

// Import now, through the same sync queue as GA4/GSC/Clarity (locks, history, retries)
router.post(
  `${base}/import`,
  ...guard('integrations.manage'),
  wrap((req) =>
    syncOrchestratorService.triggerSync({
      workspaceId: req.params.workspaceId,
      websiteId: req.params.websiteId,
      provider: 'BING',
      jobType: 'MANUAL',
      user: req.user,
    })
  )
);

router.delete(base, ...guard('integrations.manage'), wrap((req) => bingService.disconnect(req.params.workspaceId, req.params.websiteId, req.user)));

export default router;
