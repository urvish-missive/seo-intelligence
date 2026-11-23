// backend/tests/integration/integrations.test.js
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GoogleAuthService } from '../../src/modules/integrations/google/googleAuth.service.js';
import { WebsiteIntegrationService } from '../../src/modules/integrations/websiteIntegration.service.js';
import { AnalyticsDataService } from '../../src/modules/analytics/analyticsData.service.js';
import prisma from '../../src/config/database.js';

describe('Google Integrations & Offline Analytics Integration Tests', () => {
  const googleAuthService = new GoogleAuthService();
  const websiteIntegrationService = new WebsiteIntegrationService();
  const analyticsDataService = new AnalyticsDataService();

  const mockUser = {
    id: 'user-seo-1',
    role: 'seo_manager',
    workspaceId: 'ws-test-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Website Integration Service Tests', () => {
    it('should return complete standard integration slots (GA4, GSC, CLARITY) even when not connected', async () => {
      // Mock prisma.website.findFirst
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-1',
        domain: 'example.com',
        workspaceId: 'ws-test-1',
        integrations: [],
      });

      const slots = await websiteIntegrationService.getWebsiteIntegrations('ws-test-1', 'web-1');
      expect(slots).toHaveLength(3);
      expect(slots.map((s) => s.integrationType)).toEqual(
        expect.arrayContaining(['GA4', 'GSC', 'CLARITY'])
      );
      expect(slots.every((s) => s.status === 'NOT_CONNECTED')).toBe(true);
    });

    it('should connect a GA4 property to a website when valid', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-1',
        domain: 'example.com',
        workspaceId: 'ws-test-1',
      });

      jest.spyOn(prisma.googleAccount, 'findFirst').mockResolvedValue({
        id: 'gacc-1',
        email: 'agency@missivedigital.com',
        status: 'CONNECTED',
        workspaceId: 'ws-test-1',
      });

      jest.spyOn(prisma.integrationConnection, 'upsert').mockResolvedValue({
        id: 'conn-1',
        websiteId: 'web-1',
        workspaceId: 'ws-test-1',
        integrationType: 'GA4',
        selectedProperty: 'properties/12345678',
        selectedPropertyName: 'Missive GA4 Stream',
        status: 'CONNECTED',
        googleAccount: {
          id: 'gacc-1',
          email: 'agency@missivedigital.com',
          displayName: 'Missive SEO',
          status: 'CONNECTED',
        },
      });

      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({});

      const connected = await websiteIntegrationService.connectProperty({
        workspaceId: 'ws-test-1',
        websiteId: 'web-1',
        integrationType: 'GA4',
        googleAccountId: 'gacc-1',
        selectedProperty: 'properties/12345678',
        selectedPropertyName: 'Missive GA4 Stream',
        user: mockUser,
      });

      expect(connected.selectedProperty).toBe('properties/12345678');
      expect(connected.status).toBe('CONNECTED');
      expect(connected.googleAccount.email).toBe('agency@missivedigital.com');
    });

    it('should reject connecting when Google account is expired or revoked', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-1',
        domain: 'example.com',
        workspaceId: 'ws-test-1',
      });

      jest.spyOn(prisma.googleAccount, 'findFirst').mockResolvedValue({
        id: 'gacc-1',
        email: 'agency@missivedigital.com',
        status: 'REVOKED',
        workspaceId: 'ws-test-1',
      });

      await expect(
        websiteIntegrationService.connectProperty({
          workspaceId: 'ws-test-1',
          websiteId: 'web-1',
          integrationType: 'GA4',
          googleAccountId: 'gacc-1',
          selectedProperty: 'properties/12345678',
          user: mockUser,
        })
      ).rejects.toThrow(/not active/);
    });
  });

  describe('Offline Analytics Reader Tests', () => {
    it('should aggregate stored GA4 and GSC records locally without calling external APIs', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-1',
        domain: 'example.com',
        workspaceId: 'ws-test-1',
        integrations: [],
      });

      jest.spyOn(prisma.gA4DailyMetric, 'findMany').mockResolvedValue([
        {
          date: '2026-11-01',
          sessions: 150,
          organicSessions: 90,
          totalUsers: 130,
          newUsers: 80,
          conversions: 12,
          screenPageViews: 340,
          engagementRate: 0.65,
          bounceRate: 0.35,
        },
        {
          date: '2026-11-02',
          sessions: 200,
          organicSessions: 140,
          totalUsers: 180,
          newUsers: 110,
          conversions: 18,
          screenPageViews: 450,
          engagementRate: 0.70,
          bounceRate: 0.30,
        },
      ]);

      jest.spyOn(prisma.gSCDailyMetric, 'findMany').mockResolvedValue([
        {
          date: '2026-11-01',
          clicks: 45,
          impressions: 1000,
          ctr: 0.045,
          avgPosition: 12.4,
        },
        {
          date: '2026-11-02',
          clicks: 65,
          impressions: 1200,
          ctr: 0.054,
          avgPosition: 11.2,
        },
      ]);

      jest.spyOn(prisma.clarityDailyMetric, 'findMany').mockResolvedValue([]);

      const overview = await analyticsDataService.getWebsiteOverview('ws-test-1', 'web-1', {
        startDate: '2026-11-01',
        endDate: '2026-11-02',
      });

      expect(overview.domain).toBe('example.com');
      expect(overview.ga4Summary.sessions).toBe(350);
      expect(overview.ga4Summary.organicSessions).toBe(230);
      expect(overview.ga4Summary.conversions).toBe(30);
      expect(overview.gscSummary.clicks).toBe(110);
      expect(overview.gscSummary.impressions).toBe(2200);
      expect(overview.timeSeries).toHaveLength(2);
      expect(overview.timeSeries[0].sessions).toBe(150);
      expect(overview.timeSeries[0].clicks).toBe(45);
    });
  });
});
