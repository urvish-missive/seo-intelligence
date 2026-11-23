// backend/src/modules/seo-analysis/engines/ranking-movement.engine.js
// Deterministic ranking movement engine using GSC query data.

import { RULE_TYPES, DEFAULT_THRESHOLDS } from '../rules/analysis-thresholds.js';
import { determineSeverity, determinePriority, determineConfidence } from '../utils/confidence.utils.js';
import { generateFindingFingerprint } from '../utils/fingerprint.utils.js';

export class RankingMovementEngine {
  constructor(customThresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };
  }

  /**
   * Analyze ranking movements between current and previous periods.
   */
  async analyze({
    workspaceId,
    clientId,
    websiteId,
    dateRange,
    gscQueriesCurrent = [],
    gscQueriesPrevious = [],
  }) {
    const findings = [];

    // Map previous queries
    const prevMap = new Map();
    gscQueriesPrevious.forEach((q) => {
      const existing = prevMap.get(q.query) || { clicks: 0, impressions: 0, posWeight: 0 };
      existing.clicks += q.clicks || 0;
      existing.impressions += q.impressions || 0;
      existing.posWeight += (q.avgPosition || 0) * (q.impressions || 0);
      prevMap.set(q.query, existing);
    });

    // Map current queries
    const currMap = new Map();
    gscQueriesCurrent.forEach((q) => {
      const existing = currMap.get(q.query) || { clicks: 0, impressions: 0, posWeight: 0 };
      existing.clicks += q.clicks || 0;
      existing.impressions += q.impressions || 0;
      existing.posWeight += (q.avgPosition || 0) * (q.impressions || 0);
      currMap.set(q.query, existing);
    });

    for (const [query, curr] of currMap.entries()) {
      const prev = prevMap.get(query);
      if (!prev) continue; // Only evaluate queries observed in both periods to avoid false signals

      const currImpressions = curr.impressions;
      const prevImpressions = prev.impressions;
      const currPos = currImpressions > 0 ? curr.posWeight / currImpressions : 0;
      const prevPos = prevImpressions > 0 ? prev.posWeight / prevImpressions : 0;

      // Minimum impression threshold to filter noise
      if (currImpressions >= this.thresholds.MIN_PERIOD_IMPRESSIONS) {
        const posChange = currPos - prevPos; // Negative means position improved (e.g. 5.0 - 8.0 = -3.0)

        // 1. TOP 10 ENTRY (Previously > 10.0, now <= 10.0)
        if (prevPos > 10.0 && currPos <= 10.0) {
          findings.push({
            workspaceId,
            clientId,
            websiteId,
            type: RULE_TYPES.RANKING_GAIN,
            fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.RANKING_GAIN, query, 'TOP_10_ENTRY'),
            title: `Query Entered Top 10: "${query}" (#${prevPos.toFixed(1)} &rarr; #${currPos.toFixed(1)})`,
            description: `Query advanced onto Google first page into ranking position #${currPos.toFixed(1)} with ${currImpressions.toLocaleString()} search impressions.`,
            severity: 'INFORMATIONAL',
            priority: 'P3',
            confidence: 'HIGH',
            affectedTarget: query,
            targetType: 'QUERY',
            currentValue: parseFloat(currPos.toFixed(1)),
            previousValue: parseFloat(prevPos.toFixed(1)),
            changeValue: parseFloat((prevPos - currPos).toFixed(1)), // Positive number represents ranks gained
            changePercentage: null,
            evidenceJson: JSON.stringify({
              query,
              currentPosition: parseFloat(currPos.toFixed(1)),
              previousPosition: parseFloat(prevPos.toFixed(1)),
              impressionsCurrent: currImpressions,
              clicksCurrent: curr.clicks,
              impressionsPrevious: prevImpressions,
              clicksPrevious: prev.clicks,
            }),
            suggestedAction:
              'Maintain content freshness, review competing snippets in top 5, and ensure fast page loading speeds.',
            ruleVersion: '1.0.0',
          });
        }

        // 2. TOP 10 EXIT (Previously <= 10.0, now > 10.0)
        if (prevPos <= 10.0 && currPos > 10.0) {
          const severity = curr.clicks > 15 ? 'HIGH' : 'MEDIUM';
          findings.push({
            workspaceId,
            clientId,
            websiteId,
            type: RULE_TYPES.RANKING_DROP,
            fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.RANKING_DROP, query, 'TOP_10_EXIT'),
            title: `Query Fell Out of Top 10: "${query}" (#${prevPos.toFixed(1)} &rarr; #${currPos.toFixed(1)})`,
            description: `Query slipped off Google first page from position #${prevPos.toFixed(1)} down to #${currPos.toFixed(1)}, leading to immediate visibility loss.`,
            severity,
            priority: 'P1',
            confidence: 'HIGH',
            affectedTarget: query,
            targetType: 'QUERY',
            currentValue: parseFloat(currPos.toFixed(1)),
            previousValue: parseFloat(prevPos.toFixed(1)),
            changeValue: parseFloat((prevPos - currPos).toFixed(1)),
            changePercentage: null,
            evidenceJson: JSON.stringify({
              query,
              currentPosition: parseFloat(currPos.toFixed(1)),
              previousPosition: parseFloat(prevPos.toFixed(1)),
              impressionsCurrent: currImpressions,
              clicksCurrent: curr.clicks,
              impressionsPrevious: prevImpressions,
              clicksPrevious: prev.clicks,
            }),
            suggestedAction:
              'Conduct a competitive content gap analysis against URLs that displaced your ranking. Check for recent on-page modifications or canonical changes.',
            ruleVersion: '1.0.0',
          });
        }

        // 3. SIGNIFICANT POSITION LOSS (dropped by >= 3.0 ranks)
        if (posChange >= 3.0 && prevPos > 10.0 && currImpressions >= 100) {
          findings.push({
            workspaceId,
            clientId,
            websiteId,
            type: RULE_TYPES.RANKING_DROP,
            fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.RANKING_DROP, query, 'SIGNIFICANT_DROP'),
            title: `Ranking Position Declined by ${posChange.toFixed(1)} Ranks: "${query}"`,
            description: `Average ranking position slipped from #${prevPos.toFixed(1)} down to #${currPos.toFixed(1)} on high-volume query (${currImpressions.toLocaleString()} impressions).`,
            severity: 'MEDIUM',
            priority: 'P2',
            confidence: 'HIGH',
            affectedTarget: query,
            targetType: 'QUERY',
            currentValue: parseFloat(currPos.toFixed(1)),
            previousValue: parseFloat(prevPos.toFixed(1)),
            changeValue: parseFloat((-posChange).toFixed(1)),
            changePercentage: null,
            evidenceJson: JSON.stringify({
              query,
              currentPosition: parseFloat(currPos.toFixed(1)),
              previousPosition: parseFloat(prevPos.toFixed(1)),
              impressionsCurrent: currImpressions,
              clicksCurrent: curr.clicks,
            }),
            suggestedAction:
              'Check search intent matching, verify page is still indexable, and refresh core content sections.',
            ruleVersion: '1.0.0',
          });
        }
      }
    }

    return findings;
  }
}

export default RankingMovementEngine;
