// backend/src/modules/seo-analysis/engines/ctr-analysis.engine.js
// Position-aware Click-Through Rate (CTR) deficit analysis engine.

import { RULE_TYPES, DEFAULT_THRESHOLDS } from '../rules/analysis-thresholds.js';
import { getBenchmarkCtrForPosition } from '../rules/ctr-benchmarks.js';
import { calculatePercentageDelta } from '../utils/statistical.utils.js';
import { determineSeverity, determinePriority, determineConfidence } from '../utils/confidence.utils.js';
import { generateFindingFingerprint } from '../utils/fingerprint.utils.js';

export class CTRAnalysisEngine {
  constructor(customThresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };
  }

  /**
   * Analyze queries and landing pages for significant CTR deficits against position benchmarks.
   */
  async analyze({
    workspaceId,
    clientId,
    websiteId,
    dateRange,
    gscQueriesCurrent = [],
    gscPagesCurrent = [],
  }) {
    const findings = [];

    // 1. Query-level CTR Deficit Analysis
    const queryMap = new Map();
    gscQueriesCurrent.forEach((q) => {
      const existing = queryMap.get(q.query) || { clicks: 0, impressions: 0, posWeight: 0, devices: new Set() };
      existing.clicks += q.clicks || 0;
      existing.impressions += q.impressions || 0;
      existing.posWeight += (q.avgPosition || 0) * (q.impressions || 0);
      if (q.device) existing.devices.add(q.device);
      queryMap.set(q.query, existing);
    });

    for (const [query, data] of queryMap.entries()) {
      if (data.impressions >= this.thresholds.MIN_PERIOD_IMPRESSIONS * 1.5) {
        const avgPos = data.impressions > 0 ? data.posWeight / data.impressions : 0;
        const actualCtr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
        const benchmarkCtr = getBenchmarkCtrForPosition(avgPos);

        // Meaningful deficit: actual CTR is less than 50% of the benchmark for positions 1-10
        if (avgPos <= 10.0 && actualCtr < benchmarkCtr * 0.5 && benchmarkCtr - actualCtr >= 1.5) {
          const missedClicks = Math.round(((benchmarkCtr - actualCtr) / 100) * data.impressions);
          const deficitPct = calculatePercentageDelta(actualCtr, benchmarkCtr);

          const severity = determineSeverity({
            changePercentage: deficitPct,
            volume: missedClicks,
          });
          const priority = determinePriority({ severity, volume: missedClicks });
          const confidence = determineConfidence({
            sampleSize: data.impressions,
            daysCount: dateRange.daysCount,
          });

          findings.push({
            workspaceId,
            clientId,
            websiteId,
            type: RULE_TYPES.LOW_CTR,
            fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.LOW_CTR, query, 'QUERY_CTR_DEFICIT'),
            title: `Severe CTR Deficit on Rank #${avgPos.toFixed(1)} Query: "${query}"`,
            description: `Query achieves strong ranking (position ${avgPos.toFixed(1)}) but captures only ${actualCtr.toFixed(2)}% CTR vs ${benchmarkCtr.toFixed(1)}% expected benchmark (~${missedClicks} estimated missed clicks).`,
            severity,
            priority,
            confidence,
            affectedTarget: query,
            targetType: 'QUERY',
            currentValue: parseFloat(actualCtr.toFixed(2)),
            previousValue: benchmarkCtr,
            changeValue: parseFloat((actualCtr - benchmarkCtr).toFixed(2)),
            changePercentage: deficitPct,
            evidenceJson: JSON.stringify({
              target: query,
              averagePosition: parseFloat(avgPos.toFixed(1)),
              impressions: data.impressions,
              clicks: data.clicks,
              actualCtr: parseFloat(actualCtr.toFixed(2)),
              benchmarkCtr,
              estimatedMissedClicks: missedClicks,
              devices: Array.from(data.devices),
            }),
            suggestedAction:
              'Check Google search snippet for truncation, ensure title tag contains primary keyword near front, add rich schema (FAQ/Article), and test compelling meta description.',
            ruleVersion: '1.0.0',
          });
        }
      }
    }

    // 2. Page-level CTR Deficit Analysis
    const pageMap = new Map();
    gscPagesCurrent.forEach((p) => {
      const existing = pageMap.get(p.page) || { clicks: 0, impressions: 0, posWeight: 0 };
      existing.clicks += p.clicks || 0;
      existing.impressions += p.impressions || 0;
      existing.posWeight += (p.avgPosition || 0) * (p.impressions || 0);
      pageMap.set(p.page, existing);
    });

    for (const [pageUrl, data] of pageMap.entries()) {
      if (data.impressions >= this.thresholds.MIN_PERIOD_IMPRESSIONS * 3) {
        const avgPos = data.impressions > 0 ? data.posWeight / data.impressions : 0;
        const actualCtr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
        const benchmarkCtr = getBenchmarkCtrForPosition(avgPos);

        if (avgPos <= 12.0 && actualCtr < benchmarkCtr * 0.5) {
          const missedClicks = Math.round(((benchmarkCtr - actualCtr) / 100) * data.impressions);

          findings.push({
            workspaceId,
            clientId,
            websiteId,
            type: RULE_TYPES.LOW_CTR,
            fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.LOW_CTR, pageUrl, 'PAGE_CTR_DEFICIT'),
            title: `Low Click-Through Rate on High-Impression Page`,
            description: `Page generated ${data.impressions.toLocaleString()} impressions at position ${avgPos.toFixed(1)}, but achieved only ${actualCtr.toFixed(2)}% CTR (benchmark: ${benchmarkCtr.toFixed(1)}%).`,
            severity: 'MEDIUM',
            priority: 'P2',
            confidence: 'HIGH',
            affectedTarget: pageUrl,
            targetType: 'PAGE',
            currentValue: parseFloat(actualCtr.toFixed(2)),
            previousValue: benchmarkCtr,
            changeValue: parseFloat((actualCtr - benchmarkCtr).toFixed(2)),
            changePercentage: calculatePercentageDelta(actualCtr, benchmarkCtr),
            evidenceJson: JSON.stringify({
              page: pageUrl,
              averagePosition: parseFloat(avgPos.toFixed(1)),
              impressions: data.impressions,
              clicks: data.clicks,
              actualCtr: parseFloat(actualCtr.toFixed(2)),
              benchmarkCtr,
              estimatedMissedClicks: missedClicks,
            }),
            suggestedAction:
              'Audit snippet presentation on Google SERP. Compare your search result against higher-ranking competitors to understand what attracts searcher clicks.',
            ruleVersion: '1.0.0',
          });
        }
      }
    }

    return findings;
  }
}

export default CTRAnalysisEngine;
