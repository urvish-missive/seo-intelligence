// backend/src/modules/seo-analysis/engines/traffic-drop.engine.js
// Deterministic traffic drop detection engine using stored GSC and GA4 daily metrics.

import { RULE_TYPES, DEFAULT_THRESHOLDS } from '../rules/analysis-thresholds.js';
import { calculatePercentageDelta } from '../utils/statistical.utils.js';
import { determineSeverity, determinePriority, determineConfidence } from '../utils/confidence.utils.js';
import { generateFindingFingerprint } from '../utils/fingerprint.utils.js';

export class TrafficDropEngine {
  constructor(customThresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };
  }

  /**
   * Analyze traffic metrics across current and comparison periods.
   */
  async analyze({
    workspaceId,
    clientId,
    websiteId,
    dateRange,
    gscCurrent = [],
    gscPrevious = [],
    ga4Current = [],
    ga4Previous = [],
    gscPagesCurrent = [],
    gscPagesPrevious = [],
  }) {
    const findings = [];

    // 1. GSC Organic Clicks Aggregation
    const gscCurrClicks = gscCurrent.reduce((acc, r) => acc + (r.clicks || 0), 0);
    const gscPrevClicks = gscPrevious.reduce((acc, r) => acc + (r.clicks || 0), 0);
    const gscCurrImpressions = gscCurrent.reduce((acc, r) => acc + (r.impressions || 0), 0);
    const gscPrevImpressions = gscPrevious.reduce((acc, r) => acc + (r.impressions || 0), 0);

    // 2. GSC Clicks Drop Detection
    if (gscPrevClicks >= this.thresholds.MIN_PERIOD_CLICKS) {
      const clickDeltaPct = calculatePercentageDelta(gscCurrClicks, gscPrevClicks);

      if (clickDeltaPct <= -this.thresholds.TRAFFIC_DROP_MONITOR_PCT) {
        const severity = determineSeverity({
          changePercentage: clickDeltaPct,
          volume: gscPrevClicks,
        });
        const priority = determinePriority({ severity, volume: gscPrevClicks });
        const confidence = determineConfidence({
          sampleSize: gscPrevClicks,
          daysCount: dateRange.daysCount,
        });

        // Find top declining pages contributing to the drop
        const pageDeltas = this._calculatePageDropContributors(gscPagesCurrent, gscPagesPrevious);

        findings.push({
          workspaceId,
          clientId,
          websiteId,
          type: RULE_TYPES.TRAFFIC_DROP,
          fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.TRAFFIC_DROP, 'SITE', 'GSC_CLICKS'),
          title: `Organic Search Clicks Dropped by ${Math.abs(clickDeltaPct).toFixed(1)}%`,
          description: `Google Search Console organic clicks declined from ${gscPrevClicks.toLocaleString()} to ${gscCurrClicks.toLocaleString()} (${clickDeltaPct.toFixed(1)}%) between the analyzed periods.`,
          severity,
          priority,
          confidence,
          affectedTarget: 'Whole Website',
          targetType: 'SITE',
          currentValue: gscCurrClicks,
          previousValue: gscPrevClicks,
          changeValue: gscCurrClicks - gscPrevClicks,
          changePercentage: clickDeltaPct,
          evidenceJson: JSON.stringify({
            metric: 'gsc_clicks',
            currentPeriod: dateRange.current,
            previousPeriod: dateRange.previous,
            currentValue: gscCurrClicks,
            previousValue: gscPrevClicks,
            impressionsCurrent: gscCurrImpressions,
            impressionsPrevious: gscPrevImpressions,
            topDecliningPages: pageDeltas.slice(0, 5),
          }),
          suggestedAction:
            'Inspect the top declining landing pages and identify whether queries lost rankings, search demand dropped, or URL structures changed.',
          ruleVersion: '1.0.0',
        });
      }
    }

    // 3. GSC Impressions Drop Detection
    if (gscPrevImpressions >= this.thresholds.MIN_PERIOD_IMPRESSIONS * 5) {
      const impDeltaPct = calculatePercentageDelta(gscCurrImpressions, gscPrevImpressions);

      if (impDeltaPct <= -this.thresholds.TRAFFIC_DROP_WARNING_PCT) {
        const severity = determineSeverity({
          changePercentage: impDeltaPct,
          volume: gscPrevImpressions / 10,
        });
        const priority = determinePriority({ severity, volume: gscPrevImpressions / 10 });
        const confidence = determineConfidence({
          sampleSize: gscPrevImpressions,
          daysCount: dateRange.daysCount,
        });

        findings.push({
          workspaceId,
          clientId,
          websiteId,
          type: RULE_TYPES.TRAFFIC_DROP,
          fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.TRAFFIC_DROP, 'SITE', 'GSC_IMPRESSIONS'),
          title: `Search Visibility / Impressions Dropped by ${Math.abs(impDeltaPct).toFixed(1)}%`,
          description: `Google Search Console impressions fell from ${gscPrevImpressions.toLocaleString()} to ${gscCurrImpressions.toLocaleString()} (${impDeltaPct.toFixed(1)}%), indicating reduced search exposure.`,
          severity,
          priority,
          confidence,
          affectedTarget: 'Whole Website',
          targetType: 'SITE',
          currentValue: gscCurrImpressions,
          previousValue: gscPrevImpressions,
          changeValue: gscCurrImpressions - gscPrevImpressions,
          changePercentage: impDeltaPct,
          evidenceJson: JSON.stringify({
            metric: 'gsc_impressions',
            currentPeriod: dateRange.current,
            previousPeriod: dateRange.previous,
            currentValue: gscCurrImpressions,
            previousValue: gscPrevImpressions,
          }),
          suggestedAction:
            'Check indexing status, technical crawl errors in Search Console, or broad search demand shifts affecting core topics.',
          ruleVersion: '1.0.0',
        });
      }
    }

    // 4. GA4 Sessions & Organic Sessions Drop Detection
    const ga4CurrSessions = ga4Current.reduce((acc, r) => acc + (r.sessions || 0), 0);
    const ga4PrevSessions = ga4Previous.reduce((acc, r) => acc + (r.sessions || 0), 0);
    const ga4CurrOrganic = ga4Current.reduce((acc, r) => acc + (r.organicSessions || 0), 0);
    const ga4PrevOrganic = ga4Previous.reduce((acc, r) => acc + (r.organicSessions || 0), 0);

    if (ga4PrevOrganic >= this.thresholds.MIN_PERIOD_ORGANIC_SESSIONS) {
      const organicDeltaPct = calculatePercentageDelta(ga4CurrOrganic, ga4PrevOrganic);

      if (organicDeltaPct <= -this.thresholds.TRAFFIC_DROP_MONITOR_PCT) {
        const severity = determineSeverity({
          changePercentage: organicDeltaPct,
          volume: ga4PrevOrganic,
        });
        const priority = determinePriority({ severity, volume: ga4PrevOrganic });
        const confidence = determineConfidence({
          sampleSize: ga4PrevOrganic,
          daysCount: dateRange.daysCount,
        });

        findings.push({
          workspaceId,
          clientId,
          websiteId,
          type: RULE_TYPES.TRAFFIC_DROP,
          fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.TRAFFIC_DROP, 'SITE', 'GA4_ORGANIC'),
          title: `GA4 Organic Sessions Decreased by ${Math.abs(organicDeltaPct).toFixed(1)}%`,
          description: `Organic search visits recorded in Google Analytics 4 declined from ${ga4PrevOrganic.toLocaleString()} to ${ga4CurrOrganic.toLocaleString()} (${organicDeltaPct.toFixed(1)}%).`,
          severity,
          priority,
          confidence,
          affectedTarget: 'Whole Website',
          targetType: 'SITE',
          currentValue: ga4CurrOrganic,
          previousValue: ga4PrevOrganic,
          changeValue: ga4CurrOrganic - ga4PrevOrganic,
          changePercentage: organicDeltaPct,
          evidenceJson: JSON.stringify({
            metric: 'ga4_organic_sessions',
            currentPeriod: dateRange.current,
            previousPeriod: dateRange.previous,
            currentValue: ga4CurrOrganic,
            previousValue: ga4PrevOrganic,
            totalSessionsCurrent: ga4CurrSessions,
            totalSessionsPrevious: ga4PrevSessions,
          }),
          suggestedAction:
            'Cross-examine landing page traffic sources in GA4 to confirm whether the drop is isolated to organic or affects direct/referral channels.',
          ruleVersion: '1.0.0',
        });
      }
    }

    return findings;
  }

  _calculatePageDropContributors(currentPages = [], previousPages = []) {
    const prevMap = new Map();
    previousPages.forEach((p) => {
      const existing = prevMap.get(p.page) || 0;
      prevMap.set(p.page, existing + (p.clicks || 0));
    });

    const currMap = new Map();
    currentPages.forEach((p) => {
      const existing = currMap.get(p.page) || 0;
      currMap.set(p.page, existing + (p.clicks || 0));
    });

    const declines = [];
    prevMap.forEach((prevClicks, page) => {
      const currClicks = currMap.get(page) || 0;
      const diff = currClicks - prevClicks;
      if (diff < 0) {
        declines.push({
          page,
          previousClicks: prevClicks,
          currentClicks: currClicks,
          loss: Math.abs(diff),
        });
      }
    });

    return declines.sort((a, b) => b.loss - a.loss);
  }
}

export default TrafficDropEngine;
