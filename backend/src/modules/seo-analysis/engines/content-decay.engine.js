// backend/src/modules/seo-analysis/engines/content-decay.engine.js
// Multi-window content and page performance decay detection engine.

import { RULE_TYPES, DEFAULT_THRESHOLDS } from '../rules/analysis-thresholds.js';
import { calculatePercentageDelta } from '../utils/statistical.utils.js';
import { generateFindingFingerprint } from '../utils/fingerprint.utils.js';

export class ContentDecayEngine {
  constructor(customThresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };
  }

  /**
   * Detects sustained performance decline across multiple historical windows.
   *
   * @param {object} params
   * @param {Array} params.gscPagesCurrent - Current period (e.g. Days 1-28)
   * @param {Array} params.gscPagesPrevious - Preceding period (e.g. Days 29-56)
   * @param {Array} params.gscPagesPrior - Prior historical period (e.g. Days 57-84, if available)
   */
  async analyze({
    workspaceId,
    clientId,
    websiteId,
    dateRange,
    gscPagesCurrent = [],
    gscPagesPrevious = [],
    gscPagesPrior = [],
  }) {
    const findings = [];

    // Aggregate page clicks for each window
    const mapCurrent = this._aggregatePages(gscPagesCurrent);
    const mapPrevious = this._aggregatePages(gscPagesPrevious);
    const mapPrior = this._aggregatePages(gscPagesPrior);

    for (const [pageUrl, curr] of mapCurrent.entries()) {
      const prev = mapPrevious.get(pageUrl);
      const prior = mapPrior.get(pageUrl);

      // Require previous period baseline
      if (!prev || prev.clicks < 25) continue;

      const drop1 = calculatePercentageDelta(curr.clicks, prev.clicks);

      // Case A: 3-window sustained decay (Prior -> Previous -> Current continuous drop)
      if (prior && prior.clicks >= 30) {
        const drop2 = calculatePercentageDelta(prev.clicks, prior.clicks);

        // Continuous decline across both intervals
        if (drop1 <= -15.0 && drop2 <= -15.0) {
          const totalDrop = calculatePercentageDelta(curr.clicks, prior.clicks);

          findings.push({
            workspaceId,
            clientId,
            websiteId,
            type: RULE_TYPES.CONTENT_DECAY,
            fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.CONTENT_DECAY, pageUrl, 'SUSTAINED_3_PERIOD'),
            title: `Sustained Performance Decay on Page (${totalDrop.toFixed(0)}% Drop)`,
            description: `Page shows monotonic traffic erosion across 3 consecutive evaluation cycles: ${prior.clicks} &rarr; ${prev.clicks} &rarr; ${curr.clicks} clicks.`,
            severity: 'HIGH',
            priority: 'P1',
            confidence: 'HIGH',
            affectedTarget: pageUrl,
            targetType: 'PAGE',
            currentValue: curr.clicks,
            previousValue: prior.clicks,
            changeValue: curr.clicks - prior.clicks,
            changePercentage: totalDrop,
            evidenceJson: JSON.stringify({
              page: pageUrl,
              windowCurrentClicks: curr.clicks,
              windowPreviousClicks: prev.clicks,
              windowPriorClicks: prior.clicks,
              recentDropPercentage: drop1,
              priorDropPercentage: drop2,
              cumulativeDropPercentage: totalDrop,
              signalType: 'PERFORMANCE_DECAY_SIGNAL',
            }),
            suggestedAction:
              'Perform a full content refresh: update factual information, add recent examples, re-optimize title/headings, and verify whether competing pages have surpassed this URL with fresher content.',
            ruleVersion: '1.0.0',
          });
          continue;
        }
      }

      // Case B: 2-window steep erosion (>= 35% decline with high initial volume)
      if (drop1 <= -35.0 && prev.clicks >= 40) {
        findings.push({
          workspaceId,
          clientId,
          websiteId,
          type: RULE_TYPES.CONTENT_DECAY,
          fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.CONTENT_DECAY, pageUrl, 'STEEP_2_PERIOD'),
          title: `Sharp Performance Erosion on Page (-${Math.abs(drop1).toFixed(0)}% Clicks)`,
          description: `Page organic traffic fell steeply from ${prev.clicks} to ${curr.clicks} clicks. This indicates potential keyword ranking displacement or loss of search visibility.`,
          severity: 'HIGH',
          priority: 'P2',
          confidence: 'MEDIUM',
          affectedTarget: pageUrl,
          targetType: 'PAGE',
          currentValue: curr.clicks,
          previousValue: prev.clicks,
          changeValue: curr.clicks - prev.clicks,
          changePercentage: drop1,
          evidenceJson: JSON.stringify({
            page: pageUrl,
            clicksCurrent: curr.clicks,
            clicksPrevious: prev.clicks,
            impressionsCurrent: curr.impressions,
            impressionsPrevious: prev.impressions,
            dropPercentage: drop1,
            signalType: 'PERFORMANCE_DECAY_SIGNAL',
          }),
          suggestedAction:
            'Review search rankings for core queries targeting this page and check whether user search intent has shifted.',
          ruleVersion: '1.0.0',
        });
      }
    }

    return findings;
  }

  _aggregatePages(records = []) {
    const map = new Map();
    records.forEach((p) => {
      const existing = map.get(p.page) || { clicks: 0, impressions: 0 };
      existing.clicks += p.clicks || 0;
      existing.impressions += p.impressions || 0;
      map.set(p.page, existing);
    });
    return map;
  }
}

export default ContentDecayEngine;
