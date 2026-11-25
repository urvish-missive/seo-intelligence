// backend/tests/unit/ai-assistant-fixes.test.js
// Regression tests for the AI assistant: exact model health check, readable
// context with data-coverage warnings, and portfolio context without a website.
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { OllamaService } from '../../src/modules/ai/services/ollama.service.js';
import { AIContextService, AI_INTENTS } from '../../src/modules/ai/services/ai-context.service.js';
import { calculateComparisonMetric } from '../../src/utils/analyticsDate.utils.js';

describe('Ollama health check', () => {
  afterEach(() => jest.restoreAllMocks());

  const withModels = (svc, names) =>
    jest.spyOn(svc, 'getClient').mockReturnValue({
      get: async () => ({ data: { models: names.map((name) => ({ name })) } }),
    });

  it('does not treat a different size of the same family as installed', async () => {
    const svc = new OllamaService({ model: 'qwen2.5:14b' });
    withModels(svc, ['qwen2.5:3b', 'qwen2.5:7b']);
    const health = await svc.checkHealth();
    expect(health.available).toBe(true);
    expect(health.modelPresent).toBe(false);
  });

  it('matches an exact tag and treats an untagged name as :latest', async () => {
    const svc = new OllamaService({ model: 'qwen2.5:3b' });
    withModels(svc, ['qwen2.5:3b']);
    expect((await svc.checkHealth()).modelPresent).toBe(true);

    const svc2 = new OllamaService({ model: 'llama3.1' });
    withModels(svc2, ['llama3.1:latest']);
    expect((await svc2.checkHealth()).modelPresent).toBe(true);
  });
});

describe('AI context formatting', () => {
  const svc = new AIContextService();
  const website = {
    domain: 'example.com',
    clientName: 'Example Ltd',
    integrations: { ga4: false, gsc: true, clarity: false },
  };

  it('warns when the previous period is not fully synced and marks missing integrations', () => {
    const text = svc.formatContext({
      intent: AI_INTENTS.KEYWORD_OPPORTUNITIES,
      website,
      analytics: {
        period: { startDate: '2026-10-28', endDate: '2026-11-24' },
        comparisonPeriod: { startDate: '2026-09-30', endDate: '2026-10-27' },
        coverage: { gsc: { current: 25, previous: 4 }, ga4: { current: 0, previous: 0 } },
        kpis: {
          clicks: calculateComparisonMetric(203, 19),
          impressions: calculateComparisonMetric(21045, 2536),
          ctr: calculateComparisonMetric(0.96, 0.75),
          avgPosition: calculateComparisonMetric(26.6, 24.4, { inverseTrend: true }),
        },
      },
      topSearch: { queries: [{ query: 'seo agency', clicks: 10, impressions: 200, ctr: 5, avgPosition: 6.1 }], lowCtr: [] },
      strikingKeywords: [{ query: 'content optimization services', position: 5.2, impressions: 208, clicks: 4 }],
      topPages: [],
      clarityFriction: [],
      seoFindings: { findings: [], stats: { totalOpen: 0, bySeverity: {} } },
    });

    expect(text).toContain('GA4 NOT connected');
    expect(text).toContain('% changes are NOT reliable');
    expect(text).toContain('"content optimization services": position 5.2, 208 impressions');
    expect(text).toContain('Clicks: 203');
    expect(text).not.toContain('GA4:\n'); // no GA4 KPI block when GA4 is not connected
  });

  it('builds a portfolio summary when no website is selected', () => {
    const text = svc.formatContext({
      intent: AI_INTENTS.GENERAL_PERFORMANCE,
      website: null,
      portfolio: {
        dateRange: { startDate: '2026-10-28', endDate: '2026-11-24' },
        websites: [
          { domain: 'a.com', clientName: 'A', clicks: 50, impressions: 900, avgPosition: 12, sessions: 0, changes: { clicks: 10 }, integrations: { gsc: true, ga4: false } },
        ],
      },
    });
    expect(text).toContain('Whole agency portfolio');
    expect(text).toContain('a.com [A]: GSC clicks 50 (+10.0%)');
    expect(text).toContain('GA4 not connected');
  });
});
