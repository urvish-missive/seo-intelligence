// backend/tests/integration/security-audit.test.js
// Comprehensive Phase 11 Security Audit, Isolation, and Hardening Verification Suite.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { requireWorkspaceAccess, requireClientAccess, requireWebsiteAccess } from '../../src/middleware/tenantIsolation.js';
import { requirePermission } from '../../src/middleware/requirePermission.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { sanitizeCellValue } from '../../src/modules/reports/utils/formula-sanitizer.js';
import prisma from '../../src/config/database.js';
import { z } from 'zod';

function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(key, val) {
      this.headers[key] = val;
      return this;
    },
  };
  return res;
}

describe('Phase 11 Security Audit & Isolation Verification Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Multi-Tenant Isolation
  // =========================================================================
  describe('Multi-Tenant Boundary Enforcement', () => {
    it('SEC-01: should reject user attempting to access foreign workspace if not an active member', async () => {
      jest.spyOn(prisma.membership, 'findUnique').mockResolvedValue(null);

      const req = {
        user: { id: 'user-foreign', role: 'seo_manager', workspaceId: 'ws-own' },
        params: { workspaceId: 'ws-victim' },
        body: {},
        query: {},
      };
      let nextError = null;

      await requireWorkspaceAccess(req, {}, (err) => {
        nextError = err;
      });

      expect(nextError).toBeDefined();
      expect(nextError.statusCode).toBe(403);
      expect(nextError.message).toContain('Access denied: You are not an active member');
    });

    it('SEC-02: should block SEO Manager from accessing client they are not assigned to', async () => {
      jest.spyOn(prisma.client, 'findFirst').mockResolvedValue({
        id: 'client-victim',
        workspaceId: 'ws-test',
        name: 'Victim Client Corp',
      });
      jest.spyOn(prisma.clientMember, 'findUnique').mockResolvedValue(null); // Not assigned

      const req = {
        user: { id: 'user-manager-1', role: 'seo_manager', workspaceId: 'ws-test' },
        params: { clientId: 'client-victim', workspaceId: 'ws-test' },
        body: {},
        query: {},
      };
      let nextError = null;

      await requireClientAccess(req, {}, (err) => {
        nextError = err;
      });

      expect(nextError).toBeDefined();
      expect(nextError.statusCode).toBe(403);
      expect(nextError.message).toContain('You are not assigned to this client');
    });

    it('SEC-03: should block user from accessing website of an unassigned client', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-victim',
        workspaceId: 'ws-test',
        clientId: 'client-unassigned',
        domain: 'unauthorized-site.com',
        client: { id: 'client-unassigned', name: 'Victim Client', slug: 'victim-client' },
      });
      jest.spyOn(prisma.clientMember, 'findUnique').mockResolvedValue(null); // No assignment

      const req = {
        user: { id: 'user-viewer-1', role: 'viewer', workspaceId: 'ws-test' },
        params: { websiteId: 'web-victim', workspaceId: 'ws-test' },
        body: {},
        query: {},
      };
      let nextError = null;

      await requireWebsiteAccess(req, {}, (err) => {
        nextError = err;
      });

      expect(nextError).toBeDefined();
      expect(nextError.statusCode).toBe(403);
      expect(nextError.message).toContain('not assigned to this website\'s client');
    });

    it('SEC-04: should return 404 when website belongs to a different workspace', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue(null); // Cross-workspace not found

      const req = {
        user: { id: 'user-admin', role: 'admin', workspaceId: 'ws-alpha' },
        params: { websiteId: 'web-beta', workspaceId: 'ws-alpha' },
        body: {},
        query: {},
      };
      let nextError = null;

      await requireWebsiteAccess(req, {}, (err) => {
        nextError = err;
      });

      expect(nextError).toBeDefined();
      expect(nextError.statusCode).toBe(404);
      expect(nextError.message).toContain('Website not found');
    });

    it('SEC-05: should allow Super Admin unconditional access to any website and client', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-any',
        workspaceId: 'ws-other',
        clientId: 'client-other',
        domain: 'site.com',
        client: { id: 'client-other', name: 'Other', slug: 'other' },
      });

      const req = {
        user: { id: 'u-super-admin', role: 'super_admin', workspaceId: 'ws-main' },
        params: { websiteId: 'web-any' },
        body: {},
        query: {},
      };
      let nextCalled = false;

      await requireWebsiteAccess(req, {}, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.website.id).toBe('web-any');
    });
  });

  // =========================================================================
  // 2. RBAC Permission Checks
  // =========================================================================
  describe('RBAC Permission Enforcement', () => {
    it('SEC-06: should deny access when user lacks required permission', () => {
      const middleware = requirePermission('reports.delete');
      const req = {
        user: {
          id: 'u-viewer',
          role: 'viewer',
          permissions: ['reports.view', 'websites.view'],
        },
      };
      let nextError = null;

      middleware(req, {}, (err) => {
        nextError = err;
      });

      expect(nextError).toBeDefined();
      expect(nextError.statusCode).toBe(403);
      expect(nextError.message).toContain('Missing permission');
    });

    it('SEC-07: should allow access when user holds required permission', () => {
      const middleware = requirePermission('reports.generate');
      const req = {
        user: {
          id: 'u-manager',
          role: 'seo_manager',
          permissions: ['reports.view', 'reports.generate', 'websites.view'],
        },
      };
      let nextCalled = false;

      middleware(req, {}, (err) => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });
  });

  // =========================================================================
  // 3. Refresh Token Reuse Detection
  // =========================================================================
  describe('Refresh Token Rotation & Compromise Detection', () => {
    it('SEC-08: should detect reuse of revoked refresh token and invalidate all user sessions', async () => {
      const authService = new AuthService();
      const compromisedToken = 'stolen_and_already_revoked_token_xyz_123';

      // Mock finding an already-revoked refresh token
      jest.spyOn(prisma.refreshToken, 'findUnique').mockResolvedValue({
        id: 'token-revoked-1',
        userId: 'victim-user-123',
        tokenHash: 'some_hash',
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: new Date(Date.now() - 3600000), // revoked 1 hour ago!
      });

      const updateManySpy = jest.spyOn(prisma.refreshToken, 'updateMany').mockResolvedValue({ count: 4 });

      await expect(authService.refreshAccessToken(compromisedToken)).rejects.toThrow();

      // All sessions for this victim user must be immediately revoked
      expect(updateManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'victim-user-123',
            revokedAt: null,
          }),
        })
      );
    });
  });

  // =========================================================================
  // 4. Input Sanitization & Error Handling (Zod & Schema)
  // =========================================================================
  describe('Input Sanitization & Secure Error Handling', () => {
    it('SEC-09: should return clean 400 Bad Request on Zod validation failure without leaking stack traces', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().int().min(18),
      });

      let caughtErr = null;
      try {
        schema.parse({ email: 'invalid-email', age: 12 });
      } catch (err) {
        caughtErr = err;
      }

      expect(caughtErr).toBeDefined();

      const req = {};
      const res = createMockResponse();

      errorHandler(caughtErr, req, res, () => {});

      expect(res.statusCode).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toBe('Validation failed');
      expect(Array.isArray(res.data.errors)).toBe(true);
      expect(res.data.errors.length).toBeGreaterThan(0);
      expect(res.data.errors[0]).toHaveProperty('field');
      expect(res.data.errors[0]).toHaveProperty('message');
      // Ensure no raw internal database or stack leak
      expect(res.data.stack).toBeUndefined();
    });

    it('SEC-10: should sanitize formula injection characters in Excel export cells', () => {
      const dangerousInputs = [
        '=cmd|"/C calc"!A0',
        '+10+20',
        '-50*2',
        '@SUM(1,2)',
        '\tTAB_INDENT',
        '\rCR_INJECTION',
      ];

      for (const dangerous of dangerousInputs) {
        const sanitized = sanitizeCellValue(dangerous);
        expect(sanitized.startsWith("'")).toBe(true);
      }

      // Safe inputs should not be modified
      expect(sanitizeCellValue('Normal SEO Text')).toBe('Normal SEO Text');
      expect(sanitizeCellValue(12345)).toBe(12345);
      expect(sanitizeCellValue(null)).toBe('');
    });
  });

  // =========================================================================
  // 5. Sensitive Information Disclosure Defense
  // =========================================================================
  describe('Health Probes Information Disclosure Protection', () => {
    it('SEC-11: should ensure detailed health endpoint never leaks environment secrets', async () => {
      // Import the health router
      const { default: healthRouter } = await import('../../src/modules/health/health.routes.js');
      expect(healthRouter).toBeDefined();

      // Mock database queryRaw
      jest.spyOn(prisma, '$queryRaw').mockResolvedValue([1]);

      const req = {};
      const res = createMockResponse();

      // Find the detailed health handler
      const detailedRoute = healthRouter.stack.find(
        (layer) => layer.route && layer.route.path === '/health/detailed'
      );
      expect(detailedRoute).toBeDefined();

      const handler = detailedRoute.route.stack[0].handle;
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.success).toBe(true);

      const jsonString = JSON.stringify(res.data);

      // Verify no sensitive credentials or keys are exposed
      expect(jsonString).not.toContain('mysql://');
      expect(jsonString).not.toContain('redis://');
      expect(jsonString).not.toContain('password');
      expect(jsonString).not.toContain('jwt_secret');
      expect(jsonString).not.toContain('encryption_key');
      expect(jsonString).not.toContain('client_secret');
    });
  });
});
