// backend/src/modules/seo-analysis/controllers/seo-analysis.controller.js
// REST Controller for SEO Analysis Engine, Finding Lifecycle, and Settings endpoints.

import { seoAnalysisService } from '../services/seo-analysis.service.js';
import { seoFindingService } from '../services/seo-finding.service.js';
import { seoSettingService } from '../services/seo-setting.service.js';
import { addAnalysisJob } from '../queues/seo-analysis.queue.js';
import prisma from '../../../config/database.js';

export class SEOAnalysisController {
  // 1. Dashboard Overview Stats
  async getOverview(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const stats = await seoFindingService.getWebsiteOverviewStats(workspaceId, websiteId);
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }

  // 2. Paginated Findings with Filters
  async getFindings(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { type, severity, priority, status, search, limit, offset, sortBy, sortOrder } = req.query;

      const result = await seoFindingService.getFindings(workspaceId, websiteId, {
        type,
        severity,
        priority,
        status,
        search,
        limit,
        offset,
        sortBy,
        sortOrder,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // 3. Single Finding Details by ID
  async getFindingById(req, res, next) {
    try {
      const { workspaceId, findingId } = req.params;
      const finding = await seoFindingService.getFindingById(workspaceId, findingId);
      res.json({ success: true, data: finding });
    } catch (err) {
      next(err);
    }
  }

  // 4. Opportunities Specialized Endpoint
  async getOpportunities(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const result = await seoFindingService.getFindings(workspaceId, websiteId, {
        type: 'KEYWORD_OPPORTUNITY',
        limit: req.query.limit || 50,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // 5. Traffic Drops Endpoint
  async getTrafficDrops(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const result = await seoFindingService.getFindings(workspaceId, websiteId, {
        type: 'TRAFFIC_DROP',
        limit: req.query.limit || 50,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // 6. Keyword Opportunities
  async getKeywordOpportunities(req, res, next) {
    return this.getOpportunities(req, res, next);
  }

  // 7. CTR Issues
  async getCtrIssues(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const result = await seoFindingService.getFindings(workspaceId, websiteId, {
        type: 'LOW_CTR',
        limit: req.query.limit || 50,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // 8. Ranking Movements
  async getRankingMovements(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const [drops, gains] = await Promise.all([
        seoFindingService.getFindings(workspaceId, websiteId, { type: 'RANKING_DROP', limit: 30 }),
        seoFindingService.getFindings(workspaceId, websiteId, { type: 'RANKING_GAIN', limit: 30 }),
      ]);
      res.json({
        success: true,
        data: {
          drops: drops.findings,
          gains: gains.findings,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // 9. Content Decay
  async getContentDecay(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const result = await seoFindingService.getFindings(workspaceId, websiteId, {
        type: 'CONTENT_DECAY',
        limit: req.query.limit || 50,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // 10. Behaviour Insights (Clarity)
  async getBehaviourInsights(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const result = await seoFindingService.getFindings(workspaceId, websiteId, {
        type: 'BEHAVIOUR_FRICTION',
        limit: req.query.limit || 50,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // 11. Run Analysis (Synchronous or Queued via BullMQ)
  async runAnalysis(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const { startDate, endDate, analysisType, async = false } = req.body;

      if (async) {
        const job = await addAnalysisJob({
          workspaceId,
          websiteId,
          startDate,
          endDate,
          analysisType,
          userId: req.user.id,
        });

        return res.status(202).json({
          success: true,
          message: 'SEO Analysis job queued in background',
          jobId: job.id,
        });
      }

      const result = await seoAnalysisService.runAnalysis(workspaceId, websiteId, {
        startDate,
        endDate,
        analysisType,
        userId: req.user.id,
      });

      res.json({
        success: true,
        message: 'Analysis completed successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  // 12. Update Finding Status
  async updateFindingStatus(req, res, next) {
    try {
      const { workspaceId, findingId } = req.params;
      const { status, note } = req.body;

      const updated = await seoFindingService.updateFindingStatus(workspaceId, findingId, {
        status,
        note,
        userId: req.user.id,
      });

      res.json({
        success: true,
        message: `Finding status updated to ${status}`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  // 13. Analysis Run History
  async getAnalysisHistory(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const runs = await prisma.sEOAnalysisRun.findMany({
        where: { workspaceId, websiteId },
        take: 20,
        orderBy: { createdAt: 'desc' },
      });

      res.json({ success: true, data: runs });
    } catch (err) {
      next(err);
    }
  }

  // 14. Get Settings
  async getSettings(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const settings = await seoSettingService.getSettings(workspaceId, websiteId);
      res.json({ success: true, data: settings });
    } catch (err) {
      next(err);
    }
  }

  // 15. Update Settings
  async updateSettings(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const updated = await seoSettingService.updateSettings(workspaceId, websiteId, req.body);
      res.json({
        success: true,
        message: 'Analysis settings updated',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const seoAnalysisController = new SEOAnalysisController();
export default seoAnalysisController;
