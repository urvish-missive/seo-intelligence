// backend/tests/unit/analytics.test.js
// Unit tests for Analytics calculation engine, date comparisons, and GSC/GA4 metrics.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  getComparisonDateRanges,
  calculateComparisonMetric,
  parseDate,
  formatDate,
} from '../../src/utils/analyticsDate.utils.js';
import { AnalyticsDataService } from '../../src/modules/analytics/analyticsData.service.js';
import prisma from '../../src/config/database.js';

describe('SEO Analytics Comparison & Calculation Engine', () => {
  const analyticsService = new AnalyticsDataService();

  describe('Date Range Comparison Utilities', () => {
    it('should calculate exact preceding period for a 28-day window', () => {
      const ranges = getComparisonDateRanges('2026-10-24', '2026-11-20');
      expect(ranges.current.daysCount).toBe(28);
      expect(ranges.current.startDate).toBe('2026-10-24');
      expect(ranges.current.endDate).toBe('2026-11-20');

      expect(ranges.previous.daysCount).toBe(28);
      expect(ranges.previous.endDate).toBe('2026-10-23');
      expect(ranges.previous.startDate).toBe('2026-09-26');
    });

    it('should calculate exact preceding period for a 7-day window', () => {
      const ranges = getComparisonDateRanges('2026-11-14', '2026-11-20');
      expect(ranges.current.daysCount).toBe(7);
      expect(ranges.previous.daysCount).toBe(7);
      expect(ranges.previous.endDate).toBe('2026-11-13');
      expect(ranges.previous.startDate).toBe('2026-11-07');
    });

    it('should throw error if startDate is after endDate', () => {
      expect(() => {
        getComparisonDateRanges('2026-11-20', '2026-11-10');
      }).toThrow(/startDate must be before or equal to endDate/);
    });
  });

  describe('Period Metric Comparison Calculations', () => {
    it('should calculate normal percentage increase and positive status', () => {
      const res = calculateComparisonMetric(120, 100);
      expect(res.absoluteChange).toBe(20);
      expect(res.percentChange).toBe(20);
      expect(res.status).toBe('positive');
      expect(res.trend).toBe('up');
    });

    it('should calculate percentage decrease and negative status', () => {
      const res = calculateComparisonMetric(80, 100);
      expect(res.absoluteChange).toBe(-20);
      expect(res.percentChange).toBe(-20);
      expect(res.status).toBe('negative');
      expect(res.trend).toBe('down');
    });

    it('should invert status for metrics where lower is better (e.g. bounce rate, position)', () => {
      // Lower position is better in SERP rankings (e.g. pos 5 is better than pos 10)
      const res = calculateComparisonMetric(5, 10, { inverseTrend: true });
      expect(res.absoluteChange).toBe(-5);
      expect(res.status).toBe('positive');
      expect(res.trend).toBe('down');
    });

    it('should handle zero previous value safely without NaN or division by zero', () => {
      const res = calculateComparisonMetric(50, 0);
      expect(res.absoluteChange).toBe(50);
      expect(res.percentChange).toBe(100);
      expect(res.status).toBe('positive');
    });

    it('should handle zero current and zero previous value safely', () => {
      const res = calculateComparisonMetric(0, 0);
      expect(res.absoluteChange).toBe(0);
      expect(res.percentChange).toBe(0);
      expect(res.status).toBe('neutral');
      expect(res.trend).toBe('flat');
    });
  });

  describe('GSC Mathematical Aggregation Rules', () => {
    it('should calculate weighted average position and aggregate CTR accurately', async () => {
      jest.spyOn(analyticsService, 'verifyWebsite').mockResolvedValue({
        id: 'web-1',
        domain: 'example.com',
        integrations: [],
      });

      // Mock 2 days of GSC daily metrics:
      // Day 1: 100 clicks, 1000 impressions, pos 2.0
      // Day 2: 10 clicks, 100 impressions, pos 10.0
      // Expected total clicks = 110, total impressions = 1100
      // Expected CTR = (110 / 1100) * 100 = 10.0%
      // Expected Pos = (2.0 * 1000 + 10.0 * 100) / 1100 = 3000 / 1100 = 2.7
      jest.spyOn(prisma.gSCDailyMetric, 'findMany').mockResolvedValue([
        { date: '2026-11-01', clicks: 100, impressions: 1000, avgPosition: 2.0, ctr: 10.0 },
        { date: '2026-11-02', clicks: 10, impressions: 100, avgPosition: 10.0, ctr: 10.0 },
      ]);

      const gscSummary = await analyticsService.getGSCSummary('ws-1', 'web-1', {
        startDate: '2026-11-01',
        endDate: '2026-11-02',
      });

      expect(gscSummary.summary.clicks.current).toBe(110);
      expect(gscSummary.summary.impressions.current).toBe(1100);
      expect(gscSummary.summary.ctr.current).toBe(10.0);
      expect(gscSummary.summary.avgPosition.current).toBe(2.7);
    });
  });

  describe('GA4 Metric Aggregation Rules', () => {
    it('should aggregate users, sessions, conversions, and bounce rate accurately', async () => {
      jest.spyOn(analyticsService, 'verifyWebsite').mockResolvedValue({
        id: 'web-1',
        domain: 'example.com',
        integrations: [],
      });

      jest.spyOn(prisma.gA4DailyMetric, 'findMany').mockResolvedValue([
        {
          date: '2026-11-01',
          sessions: 500,
          organicSessions: 300,
          totalUsers: 400,
          newUsers: 100,
          activeUsers: 350,
          engagedSessions: 400,
          avgEngagementTimeSec: 60,
          conversions: 20,
          screenPageViews: 1200,
          bounceRate: 0.2,
        },
        {
          date: '2026-11-02',
          sessions: 500,
          organicSessions: 300,
          totalUsers: 400,
          newUsers: 100,
          activeUsers: 350,
          engagedSessions: 300,
          avgEngagementTimeSec: 40,
          conversions: 10,
          screenPageViews: 1000,
          bounceRate: 0.4,
        },
      ]);

      const ga4Summary = await analyticsService.getGA4Summary('ws-1', 'web-1', {
        startDate: '2026-11-01',
        endDate: '2026-11-02',
      });

      expect(ga4Summary.summary.sessions.current).toBe(1000);
      expect(ga4Summary.summary.organicSessions.current).toBe(600);
      expect(ga4Summary.summary.engagedSessions.current).toBe(700);
      expect(ga4Summary.summary.engagementRate.current).toBe(70.0); // 700 / 1000 * 100
      expect(ga4Summary.summary.conversions.current).toBe(30);
      expect(ga4Summary.summary.screenPageViews.current).toBe(2200);
      expect(ga4Summary.summary.bounceRate.current).toBe(30.0); // weighted average bounce rate
    });
  });
});
