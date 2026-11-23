// backend/src/modules/seo-analysis/engines/keyword-opportunity.engine.js
// Deterministic keyword opportunity identification engine using GSC queries.

import { RULE_TYPES, DEFAULT_THRESHOLDS } from '../rules/analysis-thresholds.js';
import { getBenchmarkCtrForPosition } from '../rules/ctr-benchmarks.js';
import { calculatePercentageDelta } from '../utils/statistical.utils.js';
import { determineSeverity, determinePriority, determineConfidence } from '../utils/confidence.utils.js';
import { generateFindingFingerprint } from '../utils/fingerprint.utils.js';

export class KeywordOpportunityEngine {
  constructor(customThresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };
  }

  /**
   * Analyze query-level metrics to detect actionable keyword opportunities.
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

    // Map previous queries by query text
    const prevMap = new Map();
    gscQueriesPrevious.forEach((q) => {
      const existing = prevMap.get(q.query) || { clicks: 0, impressions: 0, posWeight: 0 };
      existing.clicks += q.clicks || 0;
      existing.impressions += q.impressions || 0;
      existing.posWeight += (q.avgPosition || 0) * (q.impressions || 0);
      prevMap.set(q.query, existing);
    });

    // Aggregate current queries
    const currMap = new Map();
    gscQueriesCurrent.forEach((q) => {
      const existing = currMap.get(q.query) || { clicks: 0, impressions: 0, posWeight: 0 };
      existing.clicks += q.clicks || 0;
      existing.impressions += q.impressions || 0;
      existing.posWeight += (q.avgPosition || 0) * (q.impressions || 0);
      currMap.set(q.query, existing);
    });

    for (const [query, curr] of currMap.entries()) {
      const currImpressions = curr.impressions;
      const currClicks = curr.clicks;
      const currPos = currImpressions > 0 ? curr.posWeight / currImpressions : 0;
      const currCtr = currImpressions > 0 ? (currClicks / currImpressions) * 100 : 0;

      const prev = prevMap.get(query);
      const prevImpressions = prev ? prev.impressions : 0;
      const prevClicks = prev ? prev.clicks : 0;
      const prevPos = prev && prev.impressions > 0 ? prev.posWeight / prev.impressions : null;

      const benchmarkCtr = getBenchmarkCtrForPosition(currPos);

      // OPPORTUNITY A: Striking Distance Keywords (Positions 4.0 to 20.0 with meaningful impressions)
      if (
        currPos >= this.thresholds.STRIKING_DISTANCE_MIN_POS &&
        currPos <= this.thresholds.STRIKING_DISTANCE_MAX_POS &&
        currImpressions >= this.thresholds.MIN_PERIOD_IMPRESSIONS
      ) {
        const severity = determineSeverity({
          changePercentage: 25,
          volume: currImpressions,
          isOpportunity: true,
        });
        const priority = determinePriority({ severity, volume: currImpressions });
        const confidence = determineConfidence({
          sampleSize: currImpressions,
          daysCount: dateRange.daysCount,
        });

        findings.push({
          workspaceId,
          clientId,
          websiteId,
          type: RULE_TYPES.KEYWORD_OPPORTUNITY,
          fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.KEYWORD_OPPORTUNITY, query, 'STRIKING_DISTANCE'),
          title: `Striking Distance Keyword: "${query}" (Rank #${currPos.toFixed(1)})`,
          description: `Query ranks on Page 1/2 with ${currImpressions.toLocaleString()} impressions and ${currClicks.toLocaleString()} clicks. A slight ranking boost into top 3 can yield major click gains.`,
          severity,
          priority,
          confidence,
          affectedTarget: query,
          targetType: 'QUERY',
          currentValue: parseFloat(currPos.toFixed(1)),
          previousValue: prevPos !== null ? parseFloat(prevPos.toFixed(1)) : null,
          changeValue: prevPos !== null ? parseFloat((currPos - prevPos).toFixed(1)) : null,
          changePercentage: prevPos !== null ? calculatePercentageDelta(currPos, prevPos) : null,
          evidenceJson: JSON.stringify({
            opportunityType: 'STRIKING_DISTANCE',
            query,
            currentPosition: parseFloat(currPos.toFixed(1)),
            previousPosition: prevPos !== null ? parseFloat(prevPos.toFixed(1)) : null,
            impressions: currImpressions,
            clicks: currClicks,
            actualCtr: parseFloat(currCtr.toFixed(2)),
            benchmarkCtr,
          }),
          suggestedAction:
            'Strengthen on-page topical depth, improve internal linking with descriptive anchor text, and ensure target search intent is directly fulfilled.',
          ruleVersion: '1.0.0',
        });
      }

      // OPPORTUNITY B: High Impressions, Low Clicks (actual CTR < 60% of benchmark)
      if (
        currImpressions >= this.thresholds.MIN_PERIOD_IMPRESSIONS * 1.5 &&
        currPos <= 15.0 &&
        currCtr < benchmarkCtr * this.thresholds.HIGH_IMP_LOW_CTR_RATIO
      ) {
        const severity = determineSeverity({
          changePercentage: 35,
          volume: currImpressions,
          isOpportunity: true,
        });
        const priority = determinePriority({ severity, volume: currImpressions });
        const confidence = determineConfidence({
          sampleSize: currImpressions,
          daysCount: dateRange.daysCount,
        });

        findings.push({
          workspaceId,
          clientId,
          websiteId,
          type: RULE_TYPES.KEYWORD_OPPORTUNITY,
          fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.KEYWORD_OPPORTUNITY, query, 'HIGH_IMP_LOW_CTR'),
          title: `High Impression Underperforming CTR: "${query}"`,
          description: `Query generated ${currImpressions.toLocaleString()} impressions with only ${currClicks.toLocaleString()} clicks (${currCtr.toFixed(2)}% CTR vs ${benchmarkCtr.toFixed(1)}% expected benchmark).`,
          severity,
          priority,
          confidence,
          affectedTarget: query,
          targetType: 'QUERY',
          currentValue: parseFloat(currCtr.toFixed(2)),
          previousValue: benchmarkCtr,
          changeValue: parseFloat((currCtr - benchmarkCtr).toFixed(2)),
          changePercentage: parseFloat((((currCtr - benchmarkCtr) / benchmarkCtr) * 100).toFixed(1)),
          evidenceJson: JSON.stringify({
            opportunityType: 'HIGH_IMP_LOW_CTR',
            query,
            position: parseFloat(currPos.toFixed(1)),
            impressions: currImpressions,
            clicks: currClicks,
            actualCtr: parseFloat(currCtr.toFixed(2)),
            benchmarkCtr,
            estimatedMissedClicks: Math.round(((benchmarkCtr - currCtr) / 100) * currImpressions),
          }),
          suggestedAction:
            'Rewrite the title tag and meta description to increase click appeal and align snippet text directly with user search intent.',
          ruleVersion: '1.0.0',
        });
      }

      // OPPORTUNITY C: Query Momentum (Rising Queries gaining > 30% clicks & impressions)
      if (
        prev &&
        prevClicks >= 15 &&
        currClicks >= 25 &&
        currClicks > prevClicks &&
        currImpressions > prevImpressions
      ) {
        const clickGrowthPct = calculatePercentageDelta(currClicks, prevClicks);
        const impGrowthPct = calculatePercentageDelta(currImpressions, prevImpressions);

        if (clickGrowthPct >= 30 && impGrowthPct >= 20) {
          findings.push({
            workspaceId,
            clientId,
            websiteId,
            type: RULE_TYPES.KEYWORD_OPPORTUNITY,
            fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.KEYWORD_OPPORTUNITY, query, 'MOMENTUM'),
            title: `Rising Query Momentum: "${query}" (+${clickGrowthPct.toFixed(0)}% Clicks)`,
            description: `Search query demonstrates accelerating growth: clicks increased from ${prevClicks} to ${currClicks} and impressions increased by ${impGrowthPct.toFixed(0)}%.`,
            severity: 'MEDIUM',
            priority: 'P2',
            confidence: 'HIGH',
            affectedTarget: query,
            targetType: 'QUERY',
            currentValue: currClicks,
            previousValue: prevClicks,
            changeValue: currClicks - prevClicks,
            changePercentage: clickGrowthPct,
            evidenceJson: JSON.stringify({
              opportunityType: 'MOMENTUM',
              query,
              clicksCurrent: currClicks,
              clicksPrevious: prevClicks,
              impressionsCurrent: currImpressions,
              impressionsPrevious: prevImpressions,
              positionCurrent: parseFloat(currPos.toFixed(1)),
              positionPrevious: prevPos !== null ? parseFloat(prevPos.toFixed(1)) : null,
            }),
            suggestedAction:
              'Capitalize on rising demand by expanding content around this query, creating related supporting sub-pages, and featuring this page prominently in website navigation.',
            ruleVersion: '1.0.0',
          });
        }
      }
    }

    return findings;
  }
}

export default KeywordOpportunityEngine;
