// backend/tests/integration/clarity.test.js
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ClarityClientService, clarityClientService } from '../../src/modules/integrations/clarity/clarityClient.service.js';
import { ClarityConnectionService } from '../../src/modules/integrations/clarity/clarityConnection.service.js';
import { ClarityMappingService } from '../../src/modules/integrations/clarity/clarityMapping.service.js';
import { ClarityImportService } from '../../src/modules/integrations/clarity/clarityImport.service.js';
import { ClarityDataService } from '../../src/modules/integrations/clarity/clarityData.service.js';
import prisma from '../../src/config/database.js';
import { encrypt, decrypt } from '../../src/utils/encryption.js';

describe('Microsoft Clarity Integration & Behavioral Analytics Tests', () => {
  const clarityClient = new ClarityClientService();
  const clarityConnectionService = new ClarityConnectionService();
  const clarityMappingService = new ClarityMappingService();
  const clarityImportService = new ClarityImportService();
  const clarityDataService = new ClarityDataService();

  const mockUser = {
    id: 'user-seo-1',
    role: 'seo_manager',
    workspaceId: 'ws-test-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Clarity Client & Dimension Validation', () => {
    it('should allow up to 3 valid dimensions', () => {
      expect(() => {
        clarityClient.validateDimensions(['Device', 'Browser', 'Country/Region']);
      }).not.toThrow();
    });

    it('should reject more than 3 dimensions', () => {
      expect(() => {
        clarityClient.validateDimensions(['Device', 'Browser', 'OS', 'URL']);
      }).toThrow(/maximum of 3 dimensions/);
    });

    it('should reject invalid or fabricated dimension names', () => {
      expect(() => {
        clarityClient.validateDimensions(['FabricatedDimension']);
      }).toThrow(/Unsupported Clarity dimension/);
    });
  });

  describe('Clarity Connection & Quota Management', () => {
    it('should validate token, encrypt token with AES-256-GCM, and save connection', async () => {
      jest.spyOn(prisma.workspace, 'findUnique').mockResolvedValue({ id: 'ws-test-1' });

      // Mock client testToken call
      jest.spyOn(clarityClientService, 'testToken').mockResolvedValue({
        valid: true,
        sampleData: [{ metricName: 'Traffic', rows: [{ value: 100 }] }],
      });

      const rawToken = 'clarity-test-token-secret-12345';
      const encToken = encrypt(rawToken);

      jest.spyOn(prisma.clarityConnection, 'upsert').mockResolvedValue({
        id: 'clarity-conn-1',
        workspaceId: 'ws-test-1',
        projectId: 'proj-clarity-1',
        projectName: 'Main Website Clarity',
        apiTokenEnc: encToken,
        status: 'CONNECTED',
        lastValidatedAt: new Date(),
        apiCallsToday: 1,
        createdAt: new Date(),
      });

      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({});

      const result = await clarityConnectionService.createConnection({
        workspaceId: 'ws-test-1',
        projectId: 'proj-clarity-1',
        projectName: 'Main Website Clarity',
        apiToken: rawToken,
        user: mockUser,
      });

      expect(result.id).toBe('clarity-conn-1');
      expect(result.status).toBe('CONNECTED');
      expect(result.apiCallsToday).toBe(1);
      expect(result.projectId).toBe('proj-clarity-1');
      // Token must NEVER be returned
      expect(result.apiToken).toBeUndefined();
      expect(result.apiTokenEnc).toBeUndefined();
    });

    it('should enforce daily quota limit of 10 requests per day', async () => {
      // Mock connection with 10 calls already made today
      jest.spyOn(prisma.clarityConnection, 'findUnique').mockResolvedValue({
        id: 'clarity-conn-1',
        apiCallsToday: 10,
        apiCallsResetAt: new Date(),
      });

      await expect(
        clarityConnectionService.checkAndIncrementQuota('clarity-conn-1')
      ).rejects.toThrow(/daily quota limit reached/);
    });
  });

  describe('Website Mapping & Tenant Scoping', () => {
    it('should map website to active Clarity connection within workspace', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-1',
        domain: 'example.com',
        workspaceId: 'ws-test-1',
      });

      jest.spyOn(prisma.clarityConnection, 'findFirst').mockResolvedValue({
        id: 'clarity-conn-1',
        projectId: 'proj-clarity-1',
        projectName: 'Main Clarity',
        status: 'CONNECTED',
        workspaceId: 'ws-test-1',
      });

      jest.spyOn(prisma.integrationConnection, 'upsert').mockResolvedValue({
        id: 'int-conn-clarity-1',
        websiteId: 'web-1',
        workspaceId: 'ws-test-1',
        integrationType: 'CLARITY',
        selectedProperty: 'proj-clarity-1',
        selectedPropertyName: 'Main Clarity',
        clarityConnectionId: 'clarity-conn-1',
        status: 'CONNECTED',
      });

      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({});

      const mapped = await clarityMappingService.mapWebsiteToClarity({
        workspaceId: 'ws-test-1',
        websiteId: 'web-1',
        clarityConnectionId: 'clarity-conn-1',
        user: mockUser,
      });

      expect(mapped.status).toBe('CONNECTED');
      expect(mapped.selectedProperty).toBe('proj-clarity-1');
    });

    it('should reject mapping if website belongs to another workspace', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue(null);

      await expect(
        clarityMappingService.mapWebsiteToClarity({
          workspaceId: 'ws-test-1',
          websiteId: 'web-other',
          clarityConnectionId: 'clarity-conn-1',
          user: mockUser,
        })
      ).rejects.toThrow(/not found in this workspace/);
    });
  });

  describe('Clarity Offline Analytics Retrieval', () => {
    it('should calculate behavioral friction totals from locally stored daily metrics', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-1',
        domain: 'example.com',
        workspaceId: 'ws-test-1',
        integrations: [],
      });

      jest.spyOn(prisma.clarityDailyMetric, 'findMany').mockResolvedValue([
        {
          date: '2026-11-19',
          sessions: 500,
          rageClickCount: 15,
          deadClickCount: 42,
          excessiveScrollCount: 8,
          quickbackClickCount: 19,
          scriptErrorCount: 3,
          errorClickCount: 5,
          avgScrollDepth: 65.4,
          avgTimeOnPageSec: 88.2,
        },
        {
          date: '2026-11-20',
          sessions: 750,
          rageClickCount: 22,
          deadClickCount: 58,
          excessiveScrollCount: 14,
          quickbackClickCount: 25,
          scriptErrorCount: 4,
          errorClickCount: 7,
          avgScrollDepth: 68.2,
          avgTimeOnPageSec: 94.6,
        },
      ]);

      jest.spyOn(prisma.clarityDeviceMetric, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.clarityPageMetric, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.clarityImportSnapshot, 'count').mockResolvedValue(2);

      const overview = await clarityDataService.getClarityOverview('ws-test-1', 'web-1');

      expect(overview.domain).toBe('example.com');
      expect(overview.summary.totalSessions).toBe(1250);
      expect(overview.summary.totalDeadClicks).toBe(100);
      expect(overview.summary.totalRageClicks).toBe(37);
      expect(overview.summary.totalQuickbacks).toBe(44);
      expect(overview.summary.totalExcessiveScrolls).toBe(22);
      expect(overview.summary.totalScriptErrors).toBe(7);
      expect(overview.totalSnapshots).toBe(2);
    });
  });
});
