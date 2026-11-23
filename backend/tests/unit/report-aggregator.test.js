// backend/tests/unit/report-aggregator.test.js
// Unit tests for Report Data Aggregation, data freshness flags, and AI summary fallback.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { reportDataAggregatorService } from '../../src/modules/reports/services/report-data-aggregator.service.js';
import prisma from '../../src/config/database.js';
import { ollamaService } from '../../src/modules/ai/services/ollama.service.js';

describe('Report Data Aggregator Service Unit Tests', () => {
  const workspaceId = 'ws-test-rep';
  const websiteId = 'web-test-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw an error if target website does not exist in workspace', async () => {
    jest.spyOn(prisma.website, 'findFirst').mockResolvedValue(null);

    await expect(
      reportDataAggregatorService.aggregateReportData({
        workspaceId,
        websiteId: 'nonexistent-id',
        reportType: 'MONTHLY_SEO',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      })
    ).rejects.toThrow('Website with ID nonexistent-id not found in this workspace.');
  });

  it('should aggregate data with clear distinction between connected and disconnected providers', async () => {
    const mockWebsite = {
      id: websiteId,
      name: 'Client Shop',
      domain: 'shop.client.com',
      workspaceId,
      client: { id: 'c-1', name: 'Client Corp', slug: 'client-corp' },
      integrations: [
        { integrationType: 'GA4', status: 'CONNECTED', lastSyncAt: new Date('2026-11-20') },
        // GSC is disconnected
        { integrationType: 'GOOGLE_SEARCH_CONSOLE', status: 'DISCONNECTED', lastSyncAt: null },
      ],
    };

    jest.spyOn(prisma.website, 'findFirst').mockResolvedValue(mockWebsite);
    jest.spyOn(prisma.reportBranding, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.gA4DailyMetric, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.gA4TrafficSourceMetric, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.gA4LandingPageMetric, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.gSCDailyMetric, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.gSCQueryMetric, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.gSCPageMetric, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.clarityDailyMetric, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.sEOFinding, 'count').mockResolvedValue(0);
    jest.spyOn(prisma.sEOFinding, 'findMany').mockResolvedValue([]);

    const result = await reportDataAggregatorService.aggregateReportData({
      workspaceId,
      websiteId,
      reportType: 'MONTHLY_SEO',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      includeAiSummary: false,
    });

    expect(result.metadata.websiteName).toBe('Client Shop');
    expect(result.dataFreshness.GA4.connected).toBe(true);
    expect(result.dataFreshness.GSC.connected).toBe(false);
    expect(result.dataFreshness.GSC.message).toContain('not connected');
    expect(result.executiveSummary.source).toBe('DETERMINISTIC_RULES');
  });

  it('should fall back gracefully to deterministic summary when Ollama is offline', async () => {
    const mockWebsite = {
      id: websiteId,
      name: 'Client Shop',
      domain: 'shop.client.com',
      workspaceId,
      client: { id: 'c-1', name: 'Client Corp' },
      integrations: [{ integrationType: 'GA4', status: 'CONNECTED', lastSyncAt: new Date() }],
    };

    jest.spyOn(prisma.website, 'findFirst').mockResolvedValue(mockWebsite);
    jest.spyOn(prisma.reportBranding, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.gA4DailyMetric, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.sEOFinding, 'count').mockResolvedValue(0);
    jest.spyOn(prisma.sEOFinding, 'findMany').mockResolvedValue([]);

    // Simulate Ollama health failure
    jest.spyOn(ollamaService, 'checkHealth').mockResolvedValue({
      available: false,
      modelPresent: false,
      message: 'Ollama service offline',
    });

    const result = await reportDataAggregatorService.aggregateReportData({
      workspaceId,
      websiteId,
      reportType: 'MONTHLY_SEO',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      includeAiSummary: true, // Requested AI summary
    });

    expect(result.executiveSummary).toBeDefined();
    expect(result.executiveSummary.source).toContain('DETERMINISTIC_FALLBACK');
    expect(result.executiveSummary.text).toContain('Client Shop (shop.client.com)');
  });
});
