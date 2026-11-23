// backend/tests/unit/rbac.test.js
import { describe, it, expect } from '@jest/globals';
import { requirePermission, requireAnyPermission } from '../../src/middleware/requirePermission.js';
import { ROLE_DEFAULT_PERMISSIONS } from '../../../shared/constants/permissions.js';

describe('RBAC Middleware and Permissions Matrix Unit Tests', () => {
  it('should grant Super Admin unrestricted access to any permission', () => {
    const middleware = requirePermission('clients.delete');
    const req = {
      user: {
        id: 'super-admin-id',
        role: 'super_admin',
        permissions: [],
      },
    };
    let nextCalled = false;
    let nextError = null;

    middleware(req, {}, (err) => {
      nextCalled = true;
      nextError = err;
    });

    expect(nextCalled).toBe(true);
    expect(nextError).toBeUndefined();
  });

  it('should grant access when user holds the exact required permission', () => {
    const middleware = requirePermission('clients.create');
    const req = {
      user: {
        id: 'user-id',
        role: 'seo_manager',
        permissions: ['clients.view', 'clients.create', 'websites.view'],
      },
    };
    let nextCalled = false;
    let nextError = null;

    middleware(req, {}, (err) => {
      nextCalled = true;
      nextError = err;
    });

    expect(nextCalled).toBe(true);
    expect(nextError).toBeUndefined();
  });

  it('should deny access when user lacks the required permission', () => {
    const middleware = requirePermission('workspace.manage');
    const req = {
      user: {
        id: 'user-id',
        role: 'admin',
        permissions: ['clients.view', 'clients.create'], // Admin lacks workspace.manage
      },
    };
    let nextError = null;

    middleware(req, {}, (err) => {
      nextError = err;
    });

    expect(nextError).toBeDefined();
    expect(nextError.statusCode).toBe(403);
    expect(nextError.message).toContain('workspace.manage');
  });

  it('should verify Viewer role has only read-only permissions', () => {
    const viewerPermissions = ROLE_DEFAULT_PERMISSIONS.viewer;

    expect(viewerPermissions).toContain('workspace.view');
    expect(viewerPermissions).toContain('clients.view');
    expect(viewerPermissions).toContain('websites.view');
    expect(viewerPermissions).not.toContain('clients.create');
    expect(viewerPermissions).not.toContain('clients.delete');
    expect(viewerPermissions).not.toContain('websites.delete');
    expect(viewerPermissions).not.toContain('members.invite');
  });

  it('should verify SEO Executive has analysis permissions but cannot manage roles', () => {
    const executivePermissions = ROLE_DEFAULT_PERMISSIONS.seo_executive;

    expect(executivePermissions).toContain('seo.analyse');
    expect(executivePermissions).toContain('reports.create');
    expect(executivePermissions).not.toContain('roles.manage');
    expect(executivePermissions).not.toContain('workspace.update');
  });
});
