// backend/tests/unit/sync.test.js
// Unit tests for Redis, BullMQ Sync Queue, Distributed Lock, and Sync Orchestration.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SyncLockService } from '../../src/services/sync/syncLock.service.js';
import { SyncOrchestratorService } from '../../src/services/sync/syncOrchestrator.service.js';
import { defaultJobOptions, SYNC_QUEUE_NAME } from '../../src/queues/queue.config.js';
import prisma from '../../src/config/database.js';

describe('Background Synchronisation Engine (BullMQ + Redis + Orchestrator)', () => {
  const syncLockService = new SyncLockService();
  const syncOrchestrator = new SyncOrchestratorService();

  const mockUser = { id: 'user-admin-1', email: 'admin@missive.internal' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Queue Configuration & Defaults', () => {
    it('should configure appropriate exponential backoff and retry defaults', () => {
      expect(SYNC_QUEUE_NAME).toBe('missive-seo-sync');
      expect(defaultJobOptions.attempts).toBeGreaterThanOrEqual(3);
      expect(defaultJobOptions.backoff.type).toBe('exponential');
      expect(defaultJobOptions.removeOnComplete).toBeDefined();
      expect(defaultJobOptions.removeOnFail).toBeDefined();
    });
  });

  describe('Distributed Mutex Lock Service', () => {
    it('should acquire database-level lock when Redis is not ready', async () => {
      jest.spyOn(prisma.integrationConnection, 'findFirst').mockResolvedValue({
        id: 'conn-ga4-1',
        status: 'CONNECTED',
      });
      jest.spyOn(prisma.integrationConnection, 'update').mockResolvedValue({});

      const result = await syncLockService.acquireLock('web-1', 'GA4');
      expect(result.acquired).toBe(true);
      expect(result.source).toBe('database');
    });

    it('should reject acquisition if integration connection is already SYNCING recently', async () => {
      jest.spyOn(prisma.integrationConnection, 'findFirst').mockResolvedValue({
        id: 'conn-ga4-1',
        status: 'SYNCING',
        updatedAt: new Date(), // recent
      });

      const result = await syncLockService.acquireLock('web-1', 'GA4');
      expect(result.acquired).toBe(false);
    });

    it('should reset status to CONNECTED upon lock release', async () => {
      jest.spyOn(prisma.integrationConnection, 'findFirst').mockResolvedValue({
        id: 'conn-ga4-1',
        status: 'SYNCING',
      });
      const updateSpy = jest.spyOn(prisma.integrationConnection, 'update').mockResolvedValue({});

      await syncLockService.releaseLock('web-1', 'GA4', 'test-lock-id');
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'conn-ga4-1' },
        data: { status: 'CONNECTED' },
      });
    });
  });

  describe('Sync Orchestrator Service', () => {
    it('should reject trigger if provider is unsupported', async () => {
      await expect(
        syncOrchestrator.triggerSync({
          workspaceId: 'ws-1',
          websiteId: 'web-1',
          provider: 'UNSUPPORTED_PROVIDER',
          user: mockUser,
        })
      ).rejects.toThrow(/Unsupported integration provider/);
    });

    it('should reject trigger if website does not belong to workspace', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue(null);

      await expect(
        syncOrchestrator.triggerSync({
          workspaceId: 'ws-1',
          websiteId: 'web-foreign',
          provider: 'GA4',
          user: mockUser,
        })
      ).rejects.toThrow(/Target website not found/);
    });

    it('should block Clarity sync when daily quota limit (10 calls) is reached', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-1',
        domain: 'example.com',
        integrations: [
          {
            id: 'conn-clarity-1',
            integrationType: 'CLARITY',
            status: 'CONNECTED',
            clarityConnection: {
              apiCallsToday: 10, // Quota exhausted
              apiCallsResetAt: new Date(),
            },
          },
        ],
      });

      await expect(
        syncOrchestrator.triggerSync({
          workspaceId: 'ws-1',
          websiteId: 'web-1',
          provider: 'CLARITY',
          user: mockUser,
        })
      ).rejects.toThrow(/Microsoft Clarity daily export quota reached/);
    });

    it('should create SyncJob record and initiate sync in background', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-1',
        domain: 'example.com',
        integrations: [
          {
            id: 'conn-ga4-1',
            integrationType: 'GA4',
            status: 'CONNECTED',
            googleAccount: { email: 'user@gmail.com' },
          },
        ],
      });

      jest.spyOn(prisma.syncJob, 'create').mockResolvedValue({
        id: 'job-sync-123',
        status: 'PENDING',
      });

      // Spy on direct async runner
      const directSpy = jest.spyOn(syncOrchestrator, 'runDirectSyncAsync').mockImplementation(() => {});

      const response = await syncOrchestrator.triggerSync({
        workspaceId: 'ws-1',
        websiteId: 'web-1',
        provider: 'GA4',
        dateRange: { startDate: '2026-11-01', endDate: '2026-11-15' },
        user: mockUser,
      });

      expect(response.jobId).toBe('job-sync-123');
      expect(response.provider).toBe('GA4');
      expect(directSpy).toHaveBeenCalled();
    });

    it('should return aggregated sync status and schedule per provider', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-1',
        domain: 'example.com',
        integrations: [
          {
            integrationType: 'GA4',
            status: 'CONNECTED',
            selectedProperty: 'properties/12345',
            selectedPropertyName: 'Main GA4',
            googleAccount: { email: 'user@gmail.com', status: 'CONNECTED' },
          },
          {
            integrationType: 'GSC',
            status: 'CONNECTED',
            selectedProperty: 'sc-domain:example.com',
            selectedPropertyName: 'example.com',
            googleAccount: { email: 'user@gmail.com', status: 'CONNECTED' },
          },
          {
            integrationType: 'CLARITY',
            status: 'CONNECTED',
            selectedProperty: 'proj-clarity-1',
            selectedPropertyName: 'Clarity Web',
            clarityConnection: {
              projectId: 'proj-clarity-1',
              projectName: 'Clarity Web',
              apiCallsToday: 3,
              apiCallsResetAt: new Date(),
              status: 'CONNECTED',
            },
          },
        ],
        syncCheckpoints: [
          {
            provider: 'GA4',
            lastSuccessfulDate: '2026-11-19',
            lastSuccessfulSyncAt: new Date(),
          },
        ],
        syncSchedules: [
          {
            id: 'sched-1',
            provider: 'GA4',
            enabled: true,
            intervalMinutes: 1440,
            lastRunAt: new Date(),
            nextRunAt: new Date(),
          },
        ],
      });

      jest.spyOn(prisma.syncJob, 'findMany').mockResolvedValue([]);

      const status = await syncOrchestrator.getWebsiteSyncStatus('ws-1', 'web-1');
      expect(status.websiteId).toBe('web-1');
      expect(status.domain).toBe('example.com');
      expect(status.providers).toHaveLength(3);

      const ga4 = status.providers.find((p) => p.provider === 'GA4');
      expect(ga4.isConnected).toBe(true);
      expect(ga4.lastSuccessfulDate).toBe('2026-11-19');

      const clarity = status.providers.find((p) => p.provider === 'CLARITY');
      expect(clarity.clarityQuota.callsToday).toBe(3);
      expect(clarity.clarityQuota.callsRemaining).toBe(7);
    });
  });
});
