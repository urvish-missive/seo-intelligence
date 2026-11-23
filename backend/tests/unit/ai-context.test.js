// backend/tests/unit/ai-context.test.js
// Unit tests for AI Context Service: intent classification, data assembly, and grounded context building.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AIContextService, AI_INTENTS } from '../../src/modules/ai/services/ai-context.service.js';
import prisma from '../../src/config/database.js';

describe('AI Context Retrieval & Grounding Service Tests', () => {
  let contextService;

  beforeEach(() => {
    jest.clearAllMocks();
    contextService = new AIContextService();
  });

  describe('Intent Classification', () => {
    it('should classify organic traffic and GA4 decline queries as TRAFFIC_ANALYSIS', () => {
      expect(contextService.classifyIntent('Why did organic traffic drop last month?')).toBe(
        AI_INTENTS.TRAFFIC_ANALYSIS
      );
      expect(contextService.classifyIntent('Explain the decline in GA4 sessions')).toBe(
        AI_INTENTS.TRAFFIC_ANALYSIS
      );
    });

    it('should classify keyword and SERP ranking queries as KEYWORD_OPPORTUNITIES', () => {
      expect(contextService.classifyIntent('What are our striking distance keywords?')).toBe(
        AI_INTENTS.KEYWORD_OPPORTUNITIES
      );
      expect(contextService.classifyIntent('Which search console queries have high impressions but low CTR?')).toBe(
        AI_INTENTS.KEYWORD_OPPORTUNITIES
      );
    });

    it('should classify Clarity, rage clicks, and usability queries as USER_BEHAVIOUR', () => {
      expect(contextService.classifyIntent('Does Microsoft Clarity show any rage click friction?')).toBe(
        AI_INTENTS.USER_BEHAVIOUR
      );
      expect(contextService.classifyIntent('Where are dead clicks occurring on our landing pages?')).toBe(
        AI_INTENTS.USER_BEHAVIOUR
      );
    });

    it('should classify audit, issues, and opportunity queries as SEO_FINDINGS', () => {
      expect(contextService.classifyIntent('Summarise all open SEO findings and critical decay risks')).toBe(
        AI_INTENTS.SEO_FINDINGS
      );
    });

    it('should default unspecified queries to GENERAL_PERFORMANCE', () => {
      expect(contextService.classifyIntent('Hello, how is the website doing?')).toBe(
        AI_INTENTS.GENERAL_PERFORMANCE
      );
    });
  });

  describe('Context Assembly', () => {
    it('should retrieve website context and detect connected integrations', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-1',
        domain: 'missive.co.uk',
        client: { id: 'c-1', name: 'Missive UK' },
        integrations: [
          { integrationType: 'ga4', status: 'connected', lastSyncAt: new Date() },
          { integrationType: 'gsc', status: 'connected', lastSyncAt: new Date() },
        ],
      });

      jest.spyOn(prisma.clarityConnection, 'findFirst').mockResolvedValue({
        projectId: 'clarity-123',
        status: 'CONNECTED',
        lastSyncAt: new Date(),
      });

      const ctx = await contextService.getWebsiteContext('ws-1', 'web-1');
      expect(ctx.domain).toBe('missive.co.uk');
      expect(ctx.clientName).toBe('Missive UK');
      expect(ctx.integrations.ga4).toBe(true);
      expect(ctx.integrations.gsc).toBe(true);
      expect(ctx.integrations.clarity).toBe(true);
    });

    it('should assemble grounded context payload with citations and evidence meta', async () => {
      jest.spyOn(contextService, 'getWebsiteContext').mockResolvedValue({
        id: 'web-1',
        domain: 'missive.co.uk',
        clientName: 'Missive UK',
        integrations: { ga4: true, gsc: true, clarity: true },
      });

      jest.spyOn(contextService, 'getAnalyticsSummary').mockResolvedValue({
        period: { startDate: '2026-10-24', endDate: '2026-11-20' },
        comparisonPeriod: { startDate: '2026-09-26', endDate: '2026-10-23' },
        ga4Summary: { sessions: { value: 24000, percentChange: -5.4 } },
        gscSummary: { clicks: { value: 18000, percentChange: 12.1 } },
        claritySummary: { totalSessions: { value: 22000 } },
      });

      jest.spyOn(contextService, 'getStrikingDistanceKeywords').mockResolvedValue([
        { query: 'b2b seo agency london', position: 5.2, impressions: 3200, clicks: 140 },
      ]);

      jest.spyOn(contextService, 'getTopLandingPages').mockResolvedValue([
        { page: 'https://missive.co.uk/services/seo', clicks: 4200, impressions: 45000 },
      ]);

      jest.spyOn(contextService, 'getClarityFrictionPages').mockResolvedValue([
        { url: 'https://missive.co.uk/contact', deadClicks: 34, rageClicks: 12 },
      ]);

      jest.spyOn(contextService, 'getSEOFindings').mockResolvedValue({
        findings: [{ id: 'f-1', title: 'CTR deficit on /services', severity: 'HIGH' }],
        stats: { totalOpen: 1, bySeverity: { CRITICAL: 0, HIGH: 1 } },
      });

      const { intent, contextString, evidenceMeta } = await contextService.buildContext(
        'ws-1',
        'web-1',
        'Show me striking distance keyword opportunities'
      );

      expect(intent).toBe(AI_INTENTS.KEYWORD_OPPORTUNITIES);
      expect(typeof contextString).toBe('string');
      expect(contextString).toContain('b2b seo agency london');
      expect(contextString).toContain('missive.co.uk');

      expect(evidenceMeta.domain).toBe('missive.co.uk');
      expect(evidenceMeta.hasGA4).toBe(true);
      expect(evidenceMeta.hasGSC).toBe(true);
      expect(evidenceMeta.hasClarity).toBe(true);
      expect(evidenceMeta.findingsCount).toBe(1);
    });
  });
});
