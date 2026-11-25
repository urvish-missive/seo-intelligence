// backend/tests/unit/report-flatten.test.js
// The PDF/Excel generators and dashboard read flat numbers; analytics summaries
// return { current, previous, percentChange }. Guard the conversion between them.
import { describe, it, expect } from '@jest/globals';
import {
  flattenGA4Summary,
  flattenGSCSummary,
} from '../../src/modules/reports/services/report-data-aggregator.service.js';
import { calculateComparisonMetric } from '../../src/utils/analyticsDate.utils.js';

describe('report summary flattening', () => {
  it('flattens GA4 comparison metrics to numbers + change percents', () => {
    const flat = flattenGA4Summary({
      summary: {
        sessions: calculateComparisonMetric(1200, 1000),
        totalUsers: calculateComparisonMetric(800, 1000),
        conversions: calculateComparisonMetric(10, 0),
      },
    });
    expect(flat.summary.sessions).toBe(1200);
    expect(flat.summary.totalUsers).toBe(800);
    expect(flat.comparison.sessionsChangePercent).toBe(20);
    expect(flat.comparison.usersChangePercent).toBe(-20);
    expect(flat.comparison.previousSessions).toBe(1000);
  });

  it('flattens GSC metrics and exposes averagePosition', () => {
    const flat = flattenGSCSummary({
      summary: {
        clicks: calculateComparisonMetric(50, 40),
        impressions: calculateComparisonMetric(5000, 4000),
        ctr: calculateComparisonMetric(1, 1),
        avgPosition: calculateComparisonMetric(8.2, 9.4, { inverseTrend: true }),
      },
    });
    expect(flat.summary.clicks).toBe(50);
    expect(flat.summary.averagePosition).toBe(8.2);
    expect(flat.comparison.clicksChangePercent).toBe(25);
    expect(flat.comparison.positionChange).toBeCloseTo(-1.2);
  });

  it('returns nulls when a provider has no summary', () => {
    expect(flattenGA4Summary(null)).toEqual({ summary: null, comparison: null });
    expect(flattenGSCSummary(undefined)).toEqual({ summary: null, comparison: null });
  });
});
