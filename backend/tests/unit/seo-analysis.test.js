// backend/tests/unit/seo-analysis.test.js
// Unit tests for Phase 7: SEO Analysis Engine and Opportunity Detection.

import { TrafficDropEngine } from '../../src/modules/seo-analysis/engines/traffic-drop.engine.js';
import { KeywordOpportunityEngine } from '../../src/modules/seo-analysis/engines/keyword-opportunity.engine.js';
import { CTRAnalysisEngine } from '../../src/modules/seo-analysis/engines/ctr-analysis.engine.js';
import { RankingMovementEngine } from '../../src/modules/seo-analysis/engines/ranking-movement.engine.js';
import { ContentDecayEngine } from '../../src/modules/seo-analysis/engines/content-decay.engine.js';
import { BehaviourAnalysisEngine } from '../../src/modules/seo-analysis/engines/behaviour-analysis.engine.js';
import { AnomalyDetectionEngine } from '../../src/modules/seo-analysis/engines/anomaly-detection.engine.js';
import { getBenchmarkCtrForPosition } from '../../src/modules/seo-analysis/rules/ctr-benchmarks.js';
import {
  calculateMean,
  calculateStdDev,
  calculateZScore,
  calculatePercentageDelta,
} from '../../src/modules/seo-analysis/utils/statistical.utils.js';
import { generateFindingFingerprint } from '../../src/modules/seo-analysis/utils/fingerprint.utils.js';

describe('Phase 7: SEO Analysis Engine Unit Tests', () => {
  const mockContext = {
    workspaceId: 'ws-test-1',
    clientId: 'client-test-1',
    websiteId: 'web-test-1',
    dateRange: {
      current: { startDate: '2026-11-01', endDate: '2026-11-28', daysCount: 28 },
      previous: { startDate: '2026-10-04', endDate: '2026-10-31', daysCount: 28 },
      daysCount: 28,
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 1. STATISTICAL UTILITIES
  // ─────────────────────────────────────────────────────────────────────────
  describe('Statistical Utilities', () => {
    it('calculates mean and standard deviation correctly', () => {
      const data = [10, 12, 23, 23, 16, 23, 21, 16];
      const mean = calculateMean(data);
      expect(mean).toBe(18);

      const stdDev = calculateStdDev(data, mean);
      expect(Number(stdDev.toFixed(2))).toBe(5.24);
    });

    it('calculates z-score correctly', () => {
      const z = calculateZScore(28, 18, 5);
      expect(z).toBe(2.0);
    });

    it('calculates percentage deltas safely with zero handling', () => {
      expect(calculatePercentageDelta(150, 100)).toBe(50.0);
      expect(calculatePercentageDelta(50, 100)).toBe(-50.0);
      expect(calculatePercentageDelta(100, 0)).toBe(100.0);
      expect(calculatePercentageDelta(0, 0)).toBe(0);
    });

    it('generates deterministic and stable fingerprints', () => {
      const fp1 = generateFindingFingerprint('web-1', 'TRAFFIC_DROP', 'SITE', 'GSC_CLICKS');
      const fp2 = generateFindingFingerprint('web-1', 'TRAFFIC_DROP', 'SITE', 'GSC_CLICKS');
      const fp3 = generateFindingFingerprint('web-1', 'TRAFFIC_DROP', 'OTHER', 'GSC_CLICKS');

      expect(fp1).toBe(fp2);
      expect(fp1).not.toBe(fp3);
      expect(fp1).toHaveLength(32);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. TRAFFIC DROP DETECTION
  // ─────────────────────────────────────────────────────────────────────────
  describe('Traffic Drop Detection Engine', () => {
    const engine = new TrafficDropEngine();

    it('detects critical click drops when loss exceeds critical threshold with sufficient volume', async () => {
      const findings = await engine.analyze({
        ...mockContext,
        gscCurrent: [{ clicks: 600, impressions: 15000 }],
        gscPrevious: [{ clicks: 1000, impressions: 18000 }],
        ga4Current: [],
        ga4Previous: [],
      });

      expect(findings.length).toBeGreaterThan(0);
      const clickDrop = findings.find((f) => f.title.includes('Organic Search Clicks Dropped'));
      expect(clickDrop).toBeDefined();
      expect(clickDrop.severity).toBe('CRITICAL');
      expect(clickDrop.changePercentage).toBe(-40.0);
      expect(clickDrop.previousValue).toBe(1000);
      expect(clickDrop.currentValue).toBe(600);

      const evidence = JSON.parse(clickDrop.evidenceJson);
      expect(evidence.metric).toBe('gsc_clicks');
      expect(evidence.currentValue).toBe(600);
      expect(evidence.previousValue).toBe(1000);
    });

    it('does not trigger alerts on small insignificant drops below monitor threshold', async () => {
      const findings = await engine.analyze({
        ...mockContext,
        gscCurrent: [{ clicks: 970, impressions: 18000 }],
        gscPrevious: [{ clicks: 1000, impressions: 18000 }],
        ga4Current: [],
        ga4Previous: [],
      });

      const clickDrop = findings.find((f) => f.title.includes('Organic Search Clicks Dropped'));
      expect(clickDrop).toBeUndefined();
    });

    it('suppresses false alerts when baseline traffic volume is too small', async () => {
      const findings = await engine.analyze({
        ...mockContext,
        gscCurrent: [{ clicks: 5, impressions: 80 }],
        gscPrevious: [{ clicks: 10, impressions: 90 }], // -50% drop, but only 10 clicks
        ga4Current: [],
        ga4Previous: [],
      });

      expect(findings).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. KEYWORD OPPORTUNITY DETECTION
  // ─────────────────────────────────────────────────────────────────────────
  describe('Keyword Opportunity Engine', () => {
    const engine = new KeywordOpportunityEngine();

    it('identifies striking distance queries ranking between position 4 and 20', async () => {
      const findings = await engine.analyze({
        ...mockContext,
        gscQueriesCurrent: [
          { query: 'best seo software', clicks: 25, impressions: 850, avgPosition: 6.4 },
        ],
        gscQueriesPrevious: [
          { query: 'best seo software', clicks: 20, impressions: 800, avgPosition: 7.0 },
        ],
      });

      const striking = findings.find((f) => f.title.includes('Striking Distance Keyword'));
      expect(striking).toBeDefined();
      expect(striking.affectedTarget).toBe('best seo software');
      expect(striking.currentValue).toBe(6.4);
      expect(striking.type).toBe('KEYWORD_OPPORTUNITY');

      const evidence = JSON.parse(striking.evidenceJson);
      expect(evidence.opportunityType).toBe('STRIKING_DISTANCE');
      expect(evidence.currentPosition).toBe(6.4);
    });

    it('identifies high-impression queries with severe CTR deficits', async () => {
      // Position 2.0 expects ~16.0% CTR. 25 clicks on 1,500 imp is ~1.67% CTR (< 60% of benchmark)
      const findings = await engine.analyze({
        ...mockContext,
        gscQueriesCurrent: [
          { query: 'organic analytics tool', clicks: 25, impressions: 1500, avgPosition: 2.0 },
        ],
        gscQueriesPrevious: [],
      });

      const lowCtr = findings.find((f) => f.title.includes('High Impression Underperforming CTR'));
      expect(lowCtr).toBeDefined();
      expect(lowCtr.affectedTarget).toBe('organic analytics tool');

      const evidence = JSON.parse(lowCtr.evidenceJson);
      expect(evidence.opportunityType).toBe('HIGH_IMP_LOW_CTR');
      expect(evidence.benchmarkCtr).toBe(16.0);
      expect(evidence.estimatedMissedClicks).toBeGreaterThan(150);
    });

    it('identifies query momentum on queries gaining over 30% clicks', async () => {
      const findings = await engine.analyze({
        ...mockContext,
        gscQueriesCurrent: [
          { query: 'ai search platform', clicks: 80, impressions: 1200, avgPosition: 4.5 },
        ],
        gscQueriesPrevious: [
          { query: 'ai search platform', clicks: 50, impressions: 900, avgPosition: 5.2 },
        ],
      });

      const momentum = findings.find((f) => f.title.includes('Rising Query Momentum'));
      expect(momentum).toBeDefined();
      expect(momentum.changePercentage).toBe(60.0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. CTR ANALYSIS & BENCHMARKS
  // ─────────────────────────────────────────────────────────────────────────
  describe('CTR Analysis Engine', () => {
    const engine = new CTRAnalysisEngine();

    it('returns expected benchmark CTR values for various rankings', () => {
      expect(getBenchmarkCtrForPosition(1.0)).toBe(31.5);
      expect(getBenchmarkCtrForPosition(2.0)).toBe(16.0);
      expect(getBenchmarkCtrForPosition(3.0)).toBe(10.5);
      expect(getBenchmarkCtrForPosition(5.0)).toBe(5.8);
      expect(getBenchmarkCtrForPosition(12.0)).toBe(1.4);
    });

    it('flags page-level and query-level CTR underperformance', async () => {
      const findings = await engine.analyze({
        ...mockContext,
        gscQueriesCurrent: [
          { query: 'seo agency london', clicks: 15, impressions: 1200, avgPosition: 3.0 },
        ],
        gscPagesCurrent: [
          { page: '/services/seo', clicks: 30, impressions: 2500, avgPosition: 4.2 },
        ],
      });

      expect(findings.length).toBeGreaterThan(0);
      const queryFinding = findings.find((f) => f.targetType === 'QUERY');
      expect(queryFinding).toBeDefined();
      expect(queryFinding.type).toBe('LOW_CTR');

      const pageFinding = findings.find((f) => f.targetType === 'PAGE');
      expect(pageFinding).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. RANKING MOVEMENT
  // ─────────────────────────────────────────────────────────────────────────
  describe('Ranking Movement Engine', () => {
    const engine = new RankingMovementEngine();

    it('detects query entering the Top 10', async () => {
      const findings = await engine.analyze({
        ...mockContext,
        gscQueriesCurrent: [
          { query: 'seo intelligence', clicks: 40, impressions: 500, avgPosition: 6.8 },
        ],
        gscQueriesPrevious: [
          { query: 'seo intelligence', clicks: 15, impressions: 450, avgPosition: 14.2 },
        ],
      });

      const entry = findings.find((f) => f.title.includes('Entered Top 10'));
      expect(entry).toBeDefined();
      expect(entry.type).toBe('RANKING_GAIN');
      expect(entry.previousValue).toBe(14.2);
      expect(entry.currentValue).toBe(6.8);
    });

    it('detects query falling out of the Top 10', async () => {
      const findings = await engine.analyze({
        ...mockContext,
        gscQueriesCurrent: [
          { query: 'technical seo audit', clicks: 20, impressions: 600, avgPosition: 12.5 },
        ],
        gscQueriesPrevious: [
          { query: 'technical seo audit', clicks: 65, impressions: 800, avgPosition: 5.1 },
        ],
      });

      const exit = findings.find((f) => f.title.includes('Fell Out of Top 10'));
      expect(exit).toBeDefined();
      expect(exit.type).toBe('RANKING_DROP');
      expect(exit.previousValue).toBe(5.1);
      expect(exit.currentValue).toBe(12.5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. CONTENT DECAY DETECTION
  // ─────────────────────────────────────────────────────────────────────────
  describe('Content Decay Engine', () => {
    const engine = new ContentDecayEngine();

    it('detects sustained 3-window monotonic traffic erosion', async () => {
      const findings = await engine.analyze({
        ...mockContext,
        gscPagesCurrent: [{ page: '/blog/seo-guide', clicks: 50, impressions: 1000 }],
        gscPagesPrevious: [{ page: '/blog/seo-guide', clicks: 80, impressions: 1500 }],
        gscPagesPrior: [{ page: '/blog/seo-guide', clicks: 120, impressions: 2200 }],
      });

      const decay = findings.find((f) => f.title.includes('Sustained Performance Decay'));
      expect(decay).toBeDefined();
      expect(decay.type).toBe('CONTENT_DECAY');
      expect(decay.affectedTarget).toBe('/blog/seo-guide');
      expect(decay.previousValue).toBe(120);
      expect(decay.currentValue).toBe(50);

      const evidence = JSON.parse(decay.evidenceJson);
      expect(evidence.signalType).toBe('PERFORMANCE_DECAY_SIGNAL');
      expect(evidence.windowPriorClicks).toBe(120);
      expect(evidence.windowPreviousClicks).toBe(80);
      expect(evidence.windowCurrentClicks).toBe(50);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. BEHAVIOUR ANALYSIS (CLARITY)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Behaviour Analysis Engine', () => {
    const engine = new BehaviourAnalysisEngine();

    it('flags elevated dead clicks and rage clicks above thresholds', async () => {
      const findings = await engine.analyze({
        ...mockContext,
        clarityDailyMetrics: [
          {
            sessions: 200,
            deadClickCount: 25, // 12.5% dead click rate (threshold: 5%)
            rageClickCount: 12, // 6% rage click rate (threshold: 3%)
            scriptErrorCount: 15,
            quickbackClickCount: 8,
            excessiveScrollCount: 4,
          },
        ],
        clarityPageMetrics: [
          {
            page: '/checkout',
            sessions: 50,
            deadClicks: 15,
            rageClicks: 8,
            avgScrollDepth: 45,
          },
        ],
        latestSnapshot: {
          windowStart: '2026-11-20',
          windowEnd: '2026-11-22',
          preset: 'last_3_days',
        },
      });

      expect(findings.length).toBeGreaterThan(0);
      const deadClicks = findings.find((f) => f.title.includes('High Dead Click Rate'));
      expect(deadClicks).toBeDefined();
      expect(deadClicks.type).toBe('BEHAVIOUR_FRICTION');

      const rageClicks = findings.find((f) => f.title.includes('Elevated Rage Clicks'));
      expect(rageClicks).toBeDefined();

      const scriptErrors = findings.find((f) => f.title.includes('Client-Side JavaScript Errors'));
      expect(scriptErrors).toBeDefined();

      const pageHotspot = findings.find((f) => f.title.includes('User Friction Hotspot on /checkout'));
      expect(pageHotspot).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. ANOMALY DETECTION
  // ─────────────────────────────────────────────────────────────────────────
  describe('Anomaly Detection Engine', () => {
    const engine = new AnomalyDetectionEngine();

    it('detects a statistically anomalous traffic plunge exceeding 2 standard deviations', async () => {
      // 14 days of baseline traffic around 100 clicks
      const gscDaily = [
        { date: '2026-11-01', clicks: 102 },
        { date: '2026-11-02', clicks: 98 },
        { date: '2026-11-03', clicks: 105 },
        { date: '2026-11-04', clicks: 95 },
        { date: '2026-11-05', clicks: 101 },
        { date: '2026-11-06', clicks: 99 },
        { date: '2026-11-07', clicks: 103 },
        { date: '2026-11-08', clicks: 97 },
        { date: '2026-11-09', clicks: 100 },
        { date: '2026-11-10', clicks: 104 },
        { date: '2026-11-11', clicks: 96 },
        { date: '2026-11-12', clicks: 101 },
        { date: '2026-11-13', clicks: 99 },
        // Sudden drop on Nov 14 down to 20 clicks
        { date: '2026-11-14', clicks: 20 },
      ];

      const findings = await engine.analyze({
        ...mockContext,
        gscDaily,
      });

      const anomaly = findings.find((f) => f.title.includes('Traffic Plunge on 2026-11-14'));
      expect(anomaly).toBeDefined();
      expect(anomaly.type).toBe('ANOMALY');
      expect(anomaly.severity).toBe('HIGH');

      const evidence = JSON.parse(anomaly.evidenceJson);
      expect(evidence.zScore).toBeLessThan(-2.0);
      expect(evidence.actualClicks).toBe(20);
    });
  });
});
