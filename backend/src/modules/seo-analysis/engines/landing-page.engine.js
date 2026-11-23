// backend/src/modules/seo-analysis/engines/landing-page.engine.js
// Landing page performance, engagement, and click-through analysis engine.

import { RULE_TYPES, DEFAULT_THRESHOLDS } from '../rules/analysis-thresholds.js';
import { calculatePercentageDelta } from '../utils/statistical.utils.js';
import { determineSeverity, determinePriority, determineConfidence } from '../utils/confidence.utils.js';
import { generateFindingFingerprint } from '../utils/fingerprint.utils.js';

export class LandingPageEngine {
  constructor(customThresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };
  }

  /**
   * Analyze landing pages across GSC and GA4 for traffic shifts and weak engagement.
   */
  async analyze({
    workspaceId,
    clientId,
    websiteId,
    dateRange,
    gscPagesCurrent = [],
    gscPagesPrevious = [],
    ga4PagesCurrent = [],
    ga4PagesPrevious = [],
  }) {
    const findings = [];

    // Map previous GSC pages
    const prevGscMap = new Map();
    gscPagesPrevious.forEach((p) => {
      const existing = prevGscMap.get(p.page) || { clicks: 0, impressions: 0 };
      existing.clicks += p.clicks || 0;
      existing.impressions += p.impressions || 0;
      prevGscMap.set(p.page, existing);
    });

    // Map current GSC pages
    const currGscMap = new Map();
    gscPagesCurrent.forEach((p) => {
      const existing = currGscMap.get(p.page) || { clicks: 0, impressions: 0 };
      existing.clicks += p.clicks || 0;
      existing.impressions += p.impressions || 0;
      currGscMap.set(p.page, existing);
    });

    // 1. Pages Losing Significant Organic Clicks
    for (const [pageUrl, curr] of currGscMap.entries()) {
      const prev = prevGscMap.get(pageUrl);
      if (prev && prev.clicks >= 20) {
        const clickDeltaPct = calculatePercentageDelta(curr.clicks, prev.clicks);
        const loss = prev.clicks - curr.clicks;

        if (clickDeltaPct <= -25.0 && loss >= 15) {
          const severity = determineSeverity({
            changePercentage: clickDeltaPct,
            volume: loss,
          });
          const priority = determinePriority({ severity, volume: loss });
          const confidence = determineConfidence({
            sampleSize: prev.clicks,
            daysCount: dateRange.daysCount,
          });

          findings.push({
            workspaceId,
            clientId,
            websiteId,
            type: RULE_TYPES.TRAFFIC_DROP,
            fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.TRAFFIC_DROP, pageUrl, 'PAGE_CLICKS_DROP'),
            title: `Landing Page Lost ${loss} Organic Clicks (${clickDeltaPct.toFixed(1)}%)`,
            description: `Organic search clicks on ${pageUrl} decreased from ${prev.clicks} to ${curr.clicks} (${clickDeltaPct.toFixed(1)}%).`,
            severity,
            priority,
            confidence,
            affectedTarget: pageUrl,
            targetType: 'PAGE',
            currentValue: curr.clicks,
            previousValue: prev.clicks,
            changeValue: -loss,
            changePercentage: clickDeltaPct,
            evidenceJson: JSON.stringify({
              page: pageUrl,
              clicksCurrent: curr.clicks,
              clicksPrevious: prev.clicks,
              impressionsCurrent: curr.impressions,
              impressionsPrevious: prev.impressions,
            }),
            suggestedAction:
              'Check which specific queries lost clicks on this URL, inspect recent content changes, and verify server response codes.',
            ruleVersion: '1.0.0',
          });
        }
      }
    }

    // 2. High Traffic Pages with Poor Engagement (from GA4 landing pages)
    const ga4CurrMap = new Map();
    ga4PagesCurrent.forEach((p) => {
      const existing = ga4CurrMap.get(p.landingPage) || {
        sessions: 0,
        organicSessions: 0,
        engagedSessions: 0,
        engagementRateSum: 0,
        count: 0,
      };
      existing.sessions += p.sessions || 0;
      existing.organicSessions += p.organicSessions || 0;
      existing.engagedSessions += p.engagedSessions || 0;
      existing.engagementRateSum += p.engagementRate || 0;
      existing.count += 1;
      ga4CurrMap.set(p.landingPage, existing);
    });

    for (const [landingPage, data] of ga4CurrMap.entries()) {
      if (data.sessions >= 50) {
        const avgEngagementRate =
          data.sessions > 0 ? (data.engagedSessions / data.sessions) * 100 : 0;

        // Weak engagement: under 35% engagement rate on high traffic pages
        if (avgEngagementRate < 35.0) {
          findings.push({
            workspaceId,
            clientId,
            websiteId,
            type: RULE_TYPES.BEHAVIOUR_FRICTION,
            fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.BEHAVIOUR_FRICTION, landingPage, 'WEAK_ENGAGEMENT'),
            title: `Weak User Engagement (${avgEngagementRate.toFixed(1)}%) on High-Traffic Page`,
            description: `Landing page receives substantial visits (${data.sessions.toLocaleString()} sessions) but records low engagement rate (${avgEngagementRate.toFixed(1)}%).`,
            severity: 'MEDIUM',
            priority: 'P2',
            confidence: 'HIGH',
            affectedTarget: landingPage,
            targetType: 'PAGE',
            currentValue: parseFloat(avgEngagementRate.toFixed(1)),
            previousValue: 55.0, // Healthy baseline engagement rate
            changeValue: parseFloat((avgEngagementRate - 55.0).toFixed(1)),
            changePercentage: null,
            evidenceJson: JSON.stringify({
              landingPage,
              totalSessions: data.sessions,
              organicSessions: data.organicSessions,
              engagedSessions: data.engagedSessions,
              engagementRate: parseFloat(avgEngagementRate.toFixed(1)),
            }),
            suggestedAction:
              'Evaluate page above-the-fold content clarity, check mobile responsiveness, ensure navigation menus are accessible, and improve call-to-action relevance.',
            ruleVersion: '1.0.0',
          });
        }
      }
    }

    return findings;
  }
}

export default LandingPageEngine;
