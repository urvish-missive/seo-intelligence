// backend/tests/integration/tenantIsolation.test.js
import { describe, it, expect } from '@jest/globals';
import { requireWorkspaceAccess, requireClientAccess } from '../../src/middleware/tenantIsolation.js';

describe('Tenant and Multi-Client Isolation Middleware Tests', () => {
  it('should allow Super Admin to access any workspace', async () => {
    const req = {
      user: { id: 'u-admin', role: 'super_admin', workspaceId: 'ws-1' },
      params: { workspaceId: 'ws-2' },
      body: {},
      query: {},
    };
    let nextCalled = false;
    let nextErr = null;

    await requireWorkspaceAccess(req, {}, (err) => {
      nextCalled = true;
      nextErr = err;
    });

    expect(nextCalled).toBe(true);
    expect(nextErr).toBeUndefined();
    expect(req.workspaceId).toBe('ws-2');
  });

  it('should allow user if requested workspaceId matches active workspace in JWT', async () => {
    const req = {
      user: { id: 'u-1', role: 'seo_manager', workspaceId: 'ws-1' },
      params: { workspaceId: 'ws-1' },
      body: {},
      query: {},
    };
    let nextCalled = false;

    await requireWorkspaceAccess(req, {}, (err) => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.workspaceId).toBe('ws-1');
  });

  it('should reject request when workspaceId parameter is missing', async () => {
    const req = {
      user: { id: 'u-1', role: 'seo_manager', workspaceId: 'ws-1' },
      params: {},
      body: {},
      query: {},
    };
    let nextErr = null;

    await requireWorkspaceAccess(req, {}, (err) => {
      nextErr = err;
    });

    expect(nextErr).toBeDefined();
    expect(nextErr.statusCode).toBe(403);
  });
});
