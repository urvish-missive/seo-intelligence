// shared/constants/permissions.js
// Role permissions matrix — single source of truth for both backend and MCP.

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  SEO_MANAGER: 'seo_manager',
  SEO_EXECUTIVE: 'seo_executive',
  VIEWER: 'viewer',
};

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  seo_manager: 'SEO Manager',
  seo_executive: 'SEO Executive',
  viewer: 'Viewer',
};

export const PERMISSIONS = {
  // Workspace
  WORKSPACE_VIEW: 'workspace.view',
  WORKSPACE_UPDATE: 'workspace.update',
  WORKSPACE_MANAGE: 'workspace.manage',

  // Members
  MEMBERS_VIEW: 'members.view',
  MEMBERS_INVITE: 'members.invite',
  MEMBERS_UPDATE: 'members.update',
  MEMBERS_REMOVE: 'members.remove',

  // Roles
  ROLES_VIEW: 'roles.view',
  ROLES_MANAGE: 'roles.manage',

  // Clients
  CLIENTS_VIEW: 'clients.view',
  CLIENTS_CREATE: 'clients.create',
  CLIENTS_UPDATE: 'clients.update',
  CLIENTS_DELETE: 'clients.delete',
  CLIENTS_ARCHIVE: 'clients.archive',
  CLIENTS_ASSIGN: 'clients.assign',

  // Websites
  WEBSITES_VIEW: 'websites.view',
  WEBSITES_CREATE: 'websites.create',
  WEBSITES_UPDATE: 'websites.update',
  WEBSITES_DELETE: 'websites.delete',
  WEBSITES_ARCHIVE: 'websites.archive',

  // Reports
  REPORTS_VIEW: 'reports.view',
  REPORTS_CREATE: 'reports.create',
  REPORTS_EXPORT: 'reports.export',
  REPORTS_SCHEDULE: 'reports.schedule',

  // Integrations
  INTEGRATIONS_VIEW: 'integrations.view',
  INTEGRATIONS_MANAGE: 'integrations.manage',
  INTEGRATIONS_SYNC: 'integrations.sync',

  // SEO
  SEO_VIEW: 'seo.view',
  SEO_ANALYSE: 'seo.analyse',

  // AI
  AI_CHAT: 'ai.chat',
  AI_ANALYSE: 'ai.analyse',

  // Audit
  AUDIT_VIEW: 'audit.view',
};

export const SYSTEM_PERMISSIONS_CATALOG = [
  // Workspace
  { key: 'workspace.view', module: 'workspace', description: 'View workspace settings and overview' },
  { key: 'workspace.update', module: 'workspace', description: 'Update workspace name, logo, and preferences' },
  { key: 'workspace.manage', module: 'workspace', description: 'Manage root workspace configuration and ownership' },

  // Members
  { key: 'members.view', module: 'members', description: 'View workspace members and pending invitations' },
  { key: 'members.invite', module: 'members', description: 'Invite new users to the workspace' },
  { key: 'members.update', module: 'members', description: 'Modify member roles and statuses' },
  { key: 'members.remove', module: 'members', description: 'Remove members from workspace' },

  // Roles
  { key: 'roles.view', module: 'roles', description: 'View available roles and permissions' },
  { key: 'roles.manage', module: 'roles', description: 'Create and edit custom roles' },

  // Clients
  { key: 'clients.view', module: 'clients', description: 'View client listings and client details' },
  { key: 'clients.create', module: 'clients', description: 'Create new clients' },
  { key: 'clients.update', module: 'clients', description: 'Edit client information' },
  { key: 'clients.delete', module: 'clients', description: 'Permanently delete clients' },
  { key: 'clients.archive', module: 'clients', description: 'Archive and restore clients' },
  { key: 'clients.assign', module: 'clients', description: 'Assign team members to clients' },

  // Websites
  { key: 'websites.view', module: 'websites', description: 'View website directory and details' },
  { key: 'websites.create', module: 'websites', description: 'Register new websites under clients' },
  { key: 'websites.update', module: 'websites', description: 'Edit website details and configurations' },
  { key: 'websites.delete', module: 'websites', description: 'Permanently remove websites' },
  { key: 'websites.archive', module: 'websites', description: 'Archive and restore websites' },

  // Reports
  { key: 'reports.view', module: 'reports', description: 'View generated SEO reports' },
  { key: 'reports.create', module: 'reports', description: 'Generate new SEO reports' },
  { key: 'reports.export', module: 'reports', description: 'Export reports to PDF or Excel' },
  { key: 'reports.schedule', module: 'reports', description: 'Configure recurring scheduled reports' },

  // Integrations
  { key: 'integrations.view', module: 'integrations', description: 'View connected integrations and sync states' },
  { key: 'integrations.manage', module: 'integrations', description: 'Connect, authorize, or disconnect integrations' },
  { key: 'integrations.sync', module: 'integrations', description: 'Trigger manual or incremental data sync' },

  // SEO
  { key: 'seo.view', module: 'seo', description: 'View SEO audits, issues, and keyword data' },
  { key: 'seo.analyse', module: 'seo', description: 'Run deterministic SEO calculations and opportunity detection' },

  // AI
  { key: 'ai.chat', module: 'ai', description: 'Interact with the local AI assistant' },
  { key: 'ai.analyse', module: 'ai', description: 'Generate AI summaries and recommendations' },

  // Audit
  { key: 'audit.view', module: 'audit', description: 'Inspect workspace security and activity audit logs' },
];

export const ROLE_DEFAULT_PERMISSIONS = {
  super_admin: SYSTEM_PERMISSIONS_CATALOG.map(p => p.key),
  admin: SYSTEM_PERMISSIONS_CATALOG.map(p => p.key).filter(k => k !== 'workspace.manage'),
  seo_manager: [
    'workspace.view',
    'members.view',
    'clients.view',
    'clients.assign',
    'websites.view',
    'websites.create',
    'websites.update',
    'websites.archive',
    'reports.view',
    'reports.create',
    'reports.export',
    'reports.schedule',
    'integrations.view',
    'integrations.sync',
    'seo.view',
    'seo.analyse',
    'ai.chat',
    'ai.analyse',
  ],
  seo_executive: [
    'workspace.view',
    'clients.view',
    'websites.view',
    'reports.view',
    'reports.create',
    'reports.export',
    'integrations.view',
    'seo.view',
    'seo.analyse',
    'ai.chat',
  ],
  viewer: [
    'workspace.view',
    'clients.view',
    'websites.view',
    'reports.view',
    'seo.view',
  ],
};
