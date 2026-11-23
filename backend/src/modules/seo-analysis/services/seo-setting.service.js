// backend/src/modules/seo-analysis/services/seo-setting.service.js
// Service for managing per-website configurable SEO analysis thresholds.

import prisma from '../../../config/database.js';
import { DEFAULT_THRESHOLDS } from '../rules/analysis-thresholds.js';
import logger from '../../../utils/logger.js';

export class SEOSettingService {
  /**
   * Get settings for a website, returning default thresholds if not yet configured.
   */
  async getSettings(workspaceId, websiteId) {
    const setting = await prisma.sEOAnalysisSetting.findFirst({
      where: { websiteId, workspaceId },
    });

    if (!setting) {
      return {
        websiteId,
        workspaceId,
        minClicksThreshold: DEFAULT_THRESHOLDS.MIN_PERIOD_CLICKS,
        minImpressionsThreshold: DEFAULT_THRESHOLDS.MIN_PERIOD_IMPRESSIONS,
        trafficDropWarningPct: DEFAULT_THRESHOLDS.TRAFFIC_DROP_WARNING_PCT,
        trafficDropCriticalPct: DEFAULT_THRESHOLDS.TRAFFIC_DROP_CRITICAL_PCT,
        enabledEngines: {
          trafficDrop: true,
          keywordOpportunity: true,
          ctrAnalysis: true,
          rankingMovement: true,
          landingPage: true,
          contentDecay: true,
          behaviourAnalysis: true,
          anomalyDetection: true,
        },
        isDefault: true,
      };
    }

    let enabledEngines = {};
    try {
      if (setting.enabledEnginesJson) {
        enabledEngines = JSON.parse(setting.enabledEnginesJson);
      }
    } catch {
      enabledEngines = {};
    }

    return {
      ...setting,
      enabledEngines,
      isDefault: false,
    };
  }

  /**
   * Update or create custom settings for a website.
   */
  async updateSettings(workspaceId, websiteId, updates = {}) {
    const existing = await prisma.sEOAnalysisSetting.findFirst({
      where: { websiteId, workspaceId },
    });

    const data = {
      workspaceId,
      websiteId,
      minClicksThreshold: updates.minClicksThreshold ?? DEFAULT_THRESHOLDS.MIN_PERIOD_CLICKS,
      minImpressionsThreshold: updates.minImpressionsThreshold ?? DEFAULT_THRESHOLDS.MIN_PERIOD_IMPRESSIONS,
      trafficDropWarningPct: updates.trafficDropWarningPct ?? DEFAULT_THRESHOLDS.TRAFFIC_DROP_WARNING_PCT,
      trafficDropCriticalPct: updates.trafficDropCriticalPct ?? DEFAULT_THRESHOLDS.TRAFFIC_DROP_CRITICAL_PCT,
      enabledEnginesJson: updates.enabledEngines ? JSON.stringify(updates.enabledEngines) : null,
    };

    if (existing) {
      return prisma.sEOAnalysisSetting.update({
        where: { id: existing.id },
        data,
      });
    }

    return prisma.sEOAnalysisSetting.create({
      data,
    });
  }
}

export const seoSettingService = new SEOSettingService();
export default seoSettingService;
