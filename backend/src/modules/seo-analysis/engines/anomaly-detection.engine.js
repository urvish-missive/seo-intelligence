// backend/src/modules/seo-analysis/engines/anomaly-detection.engine.js
// Statistical anomaly detection engine using 7-day rolling SMA and standard deviation (Z-score).

import { RULE_TYPES, DEFAULT_THRESHOLDS } from '../rules/analysis-thresholds.js';
import { calculateMean, calculateStdDev, calculateZScore } from '../utils/statistical.utils.js';
import { generateFindingFingerprint } from '../utils/fingerprint.utils.js';

export class AnomalyDetectionEngine {
  constructor(customThresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };
  }

  /**
   * Detect statistical spikes or plunges in daily time-series.
   *
   * @param {object} params
   * @param {Array} params.gscDaily - Daily GSC records [{ date, clicks, impressions }]
   * @param {Array} params.ga4Daily - Daily GA4 records [{ date, sessions, organicSessions }]
   */
  async analyze({
    workspaceId,
    clientId,
    websiteId,
    gscDaily = [],
    ga4Daily = [],
  }) {
    const findings = [];

    // 1. GSC Daily Clicks Anomaly Detection
    if (gscDaily.length >= 14) {
      const clicksValues = gscDaily.map((d) => d.clicks || 0);
      const mean = calculateMean(clicksValues);
      const stdDev = calculateStdDev(clicksValues, mean);

      if (mean >= this.thresholds.ANOMALY_MIN_VOLUME && stdDev > 2) {
        // Inspect the latest 3 days for anomalous deviation
        const recentDays = gscDaily.slice(-3);
        for (const day of recentDays) {
          const zScore = calculateZScore(day.clicks, mean, stdDev);

          if (Math.abs(zScore) >= this.thresholds.ANOMALY_ZSCORE_THRESHOLD) {
            const isNegative = zScore < 0;
            const deviationPct = parseFloat((((day.clicks - mean) / mean) * 100).toFixed(1));

            findings.push({
              workspaceId,
              clientId,
              websiteId,
              type: RULE_TYPES.ANOMALY,
              fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.ANOMALY, day.date, 'GSC_CLICKS_ANOMALY'),
              title: `${isNegative ? 'Negative Traffic Plunge' : 'Unusual Traffic Spike'} on ${day.date} (${zScore.toFixed(1)}σ)`,
              description: `On ${day.date}, recorded organic search clicks (${day.clicks}) deviated by ${Math.abs(deviationPct)}% from the 14-day baseline mean (${mean.toFixed(1)} clicks, Z-score: ${zScore.toFixed(2)}).`,
              severity: isNegative ? 'HIGH' : 'INFORMATIONAL',
              priority: isNegative ? 'P2' : 'P4',
              confidence: 'HIGH',
              affectedTarget: day.date,
              targetType: 'DATE',
              currentValue: day.clicks,
              previousValue: parseFloat(mean.toFixed(1)),
              changeValue: parseFloat((day.clicks - mean).toFixed(1)),
              changePercentage: deviationPct,
              evidenceJson: JSON.stringify({
                date: day.date,
                actualClicks: day.clicks,
                baselineMean: parseFloat(mean.toFixed(1)),
                baselineStdDev: parseFloat(stdDev.toFixed(1)),
                zScore: parseFloat(zScore.toFixed(2)),
                sampleDaysCount: gscDaily.length,
              }),
              suggestedAction: isNegative
                ? 'Check for temporary hosting downtime, robots.txt misconfigurations, or tracking script outages on that specific date.'
                : 'Identify the queries driving this traffic spike to determine whether it is viral content or seasonal search interest.',
              ruleVersion: '1.0.0',
            });
          }
        }
      }
    }

    return findings;
  }
}

export default AnomalyDetectionEngine;
