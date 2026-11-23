// backend/src/modules/seo-analysis/utils/confidence.utils.js
// Priority, severity, and confidence rating calculator.
// Provides explainable scoring based on magnitude, traffic volume, and evidence persistence.

import { SEVERITIES, PRIORITIES, CONFIDENCE_LEVELS } from '../rules/analysis-thresholds.js';

/**
 * Calculate severity based on change magnitude, volume, and rule category.
 */
export function determineSeverity({ changePercentage, volume, isOpportunity = false }) {
  const absPct = Math.abs(changePercentage || 0);

  if (isOpportunity) {
    if (volume >= 500 && absPct >= 30) return SEVERITIES.HIGH;
    if (volume >= 100) return SEVERITIES.MEDIUM;
    return SEVERITIES.LOW;
  }

  // Issues / Drops / Decay
  if (absPct >= 35 && volume >= 50) return SEVERITIES.CRITICAL;
  if (absPct >= 20 && volume >= 30) return SEVERITIES.HIGH;
  if (absPct >= 10) return SEVERITIES.MEDIUM;
  return SEVERITIES.LOW;
}

/**
 * Calculate execution priority (P1 to P4).
 */
export function determinePriority({ severity, volume }) {
  switch (severity) {
    case SEVERITIES.CRITICAL:
      return volume >= 100 ? PRIORITIES.P1 : PRIORITIES.P2;
    case SEVERITIES.HIGH:
      return volume >= 200 ? PRIORITIES.P1 : PRIORITIES.P2;
    case SEVERITIES.MEDIUM:
      return PRIORITIES.P3;
    default:
      return PRIORITIES.P4;
  }
}

/**
 * Calculate confidence level based on sample size and historical depth.
 */
export function determineConfidence({ sampleSize, daysCount = 28 }) {
  if (sampleSize >= 100 && daysCount >= 14) return CONFIDENCE_LEVELS.HIGH;
  if (sampleSize >= 30 && daysCount >= 7) return CONFIDENCE_LEVELS.MEDIUM;
  return CONFIDENCE_LEVELS.LOW;
}

export default {
  determineSeverity,
  determinePriority,
  determineConfidence,
};
