# Missive SEO Intelligence Platform — Phase 2 Implementation Plan
## Authentication & Agency Management Architecture

> **Document:** Phase 2 Implementation Specification  
> **Target:** Multi-Tenant Agency Management, Role-Based Access Control, JWT & Session Security, Client/Website Hierarchy  
> **Status:** Approved for Implementation

---

## 1. Existing Architecture Summary (Phase 1 Baseline)

Phase 1 established the foundational structure of the Missive SEO Intelligence platform:
- **Backend (`backend/`):** Express.js ES module application configured with security headers (Helmet), CORS, JSON & Cookie parsers, rate limiting, and centralized error handling. Prisma client was defined for MySQL with an initial schema covering 30+ tables. Health endpoints (`/api/v1/health` and `/api/v1/health/detailed`) are operational.
- **Frontend (`frontend/`):** React 18 + Vite + Tailwind CSS with Redux Toolkit and RTK Query (`baseApi.js`), React Router v7 (`AppRouter.jsx`), authentication slice (`authSlice.js`), custom design tokens, and placeholder views (`LoginPage.jsx`, `DashboardPage.jsx`).
- **Shared (`shared/`):** Constants for permissions (`PERMISSIONS`, `ROLES`), integration status, and date ranges.
- **AI Engine (`ai-engine/`):** Ollama HTTP client, health checks, prompt templates, and context builder.
- **MCP Server (`mcp-server/`):** Official Model Context Protocol SDK server with health check tool and platform resource.

---

## 2. Current Database Schema Review & Analysis

The Phase 1 schema (`backend/prisma/schema.prisma`) defined:
- `User` with `displayName`, `email`, `passwordHash`, `avatarUrl`, `status (ACTIVE, INACTIVE, SUSPENDED)`.
- `Workspace` with `name`, `slug`, `description`, `logoUrl`, `timezone`.
- `Membership` with hardcoded `role MemberRole` enum.
- `Role` and `RolePermission` models with basic workspace association.
- `RefreshToken` with `tokenHash`, `expiresAt`, `ipAddress`, `userAgent`.
- `Client` and `Website` with initial SEO metric relations.
- `AuditLog` with `resourceType` and `resourceId`.

---

## 3. Required Schema Modifications for Phase 2

To achieve complete agency-level multi-tenancy, dynamic RBAC, invitation tracking, and fine-grained ownership:

1. **`User` Model:**
   - Standardize field names: `name` (and alias/maintain `displayName`), `avatar` (and `avatarUrl`), `emailVerifiedAt` timestamp.
   - Expand `UserStatus` enum: `ACTIVE`, `INVITED`, `SUSPENDED`, `DEACTIVATED`.

2. **`Workspace` Model:**
   - Add `ownerId String?` referencing the workspace owner (`User`).
   - Add `status WorkspaceStatus @default(ACTIVE)` (`ACTIVE`, `SUSPENDED`, `ARCHIVED`).
   - Add relations to invitations and clients.

3. **`Role` & `Permission` Models (Dynamic RBAC):**
   - Refactor `Role`: add `slug`, unique on `[workspaceId, slug]`.
   - Create distinct `Permission` table: `id`, `key` (unique), `module`, `description`.
   - Update `RolePermission` to link `roleId` and `permissionId` with `@@unique([roleId, permissionId])`.
   - Refactor `Membership`: replace static enum with `roleId String` referencing `Role`, add `status MembershipStatus @default(ACTIVE)`.

4. **`RefreshToken` Model (Session Security & Rotation):**
   - Add `sessionId String` to track user login sessions.
   - Add `lastUsedAt DateTime?` for rotation and reuse detection.

5. **`Invitation` Model (New):**
   - Fields: `id`, `workspaceId`, `email`, `roleId`, `invitedById`, `tokenHash`, `expiresAt`, `acceptedAt`, `status` (`PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`), `createdAt`.
   - Relations: `Workspace`, `Role`, `User` (as `invitedBy`).

6. **`Client` Model (Agency CRM):**
   - Add `companyName`, `contactName`, `contactEmail`, `contactPhone`, `website`, `status` (`ACTIVE`, `INACTIVE`, `ARCHIVED`), `createdById`, `archivedAt`.
   - Add `createdById` foreign key to `User`.

7. **`ClientMember` Model (Team Assignment):**
   - Fields: `id`, `clientId`, `userId`, `assignedById`, `createdAt`.
   - Relations to `Client`, `User` (assigned user), and `User` (assigned by).

8. **`Website` Model:**
   - Add `name`, `url`, `description`, `status` (`ACTIVE`, `INACTIVE`, `ARCHIVED`), `createdById`, `archivedAt`.
   - Retain domain normalization logic and uniqueness per client.

9. **`AuditLog` Model:**
   - Add `entityType`, `entityId`, `metadata`, referencing `Workspace` and `User`.

---

## 4. New Backend Modules Architecture

```
backend/src/modules/
├── auth/
│   ├── auth.controller.js      # Register, login, refresh, logout, password management
│   ├── auth.service.js         # Token generation, password hashing (Argon2), session management
│   ├── auth.validation.js      # Zod validation schemas for all auth payloads
│   ├── auth.utils.js           # Cookie configuration, token hashing, session helpers
│   └── auth.routes.js          # Route definitions with rate limiting
├── workspaces/
│   ├── workspace.controller.js # Workspace CRUD, statistics, workspace switching
│   ├── workspace.service.js    # Workspace data access, ownership guarantees
│   ├── workspace.validation.js # Zod schemas for workspace operations
│   └── workspace.routes.js     # Protected routes with permission checks
├── members/
│   ├── member.controller.js    # Member listings, role updates, suspensions, removals
│   ├── member.service.js       # Membership logic, invitation sending/accepting, audit logging
│   ├── member.validation.js    # Zod schemas for invitation and member actions
│   └── member.routes.js        # Protected routes
├── roles/
│   ├── role.controller.js      # Dynamic roles and permissions listing/assignment
│   ├── role.service.js         # System roles, custom roles, permission matrix
│   └── role.routes.js          # Protected routes
├── clients/
│   ├── client.controller.js    # Client CRUD, archiving, restoration, team assignment
│   ├── client.service.js       # Workspace-scoped client business logic
│   ├── client.validation.js    # Zod schemas for client operations
│   └── client.routes.js        # Protected routes with workspace and client checks
└── websites/
    ├── website.controller.js   # Website CRUD, domain normalization, archiving
    ├── website.service.js      # Client-scoped website operations
    ├── website.validation.js   # URL and domain validation schemas
    └── website.routes.js       # Protected routes
```

### Middleware:
- `backend/src/middleware/authenticate.js`: Access token JWT verification, user status validation, session context extraction.
- `backend/src/middleware/requirePermission.js`: Dynamic permission verification against database permissions and role definitions.
- `backend/src/middleware/tenantIsolation.js`: Enforces workspace and client boundary checks.

---

## 5. New Frontend Modules Architecture

```
frontend/src/
├── features/
│   ├── auth/
│   │   ├── authApi.js          # RTK Query endpoints for login, register, refresh, logout
│   │   └── authSlice.js        # Auth state, current user, active workspace, permissions
│   ├── workspace/
│   │   ├── workspaceApi.js     # RTK Query for workspaces and stats
│   │   └── workspaceSlice.js   # Active workspace selection
│   ├── members/
│   │   └── membersApi.js       # RTK Query for team members and invitations
│   ├── clients/
│   │   ├── clientsApi.js       # RTK Query for client CRUD and assignment
│   │   └── clientsSlice.js     # Client filtering and selection
│   ├── websites/
│   │   └── websitesApi.js      # RTK Query for website CRUD and health
│   └── roles/
│       └── rolesApi.js         # RTK Query for roles and permissions
├── pages/
│   ├── auth/
│   │   ├── LoginPage.jsx       # Polished login with validation and session feedback
│   │   ├── RegisterPage.jsx    # Initial super admin registration
│   │   ├── ForgotPasswordPage.jsx
│   │   ├── ResetPasswordPage.jsx
│   │   └── AcceptInvitationPage.jsx # New member onboarding via invitation token
│   ├── dashboard/
│   │   └── DashboardPage.jsx   # Agency overview: client counts, websites, stats, quick actions
│   ├── clients/
│   │   ├── ClientsPage.jsx     # Client list, filtering, search, pagination, create modal
│   │   └── ClientDetailPage.jsx# Tabs: Overview, Websites, Team Members, SEO (placeholder)
│   ├── websites/
│   │   ├── WebsitesPage.jsx    # Website directory, status filters, client filtering, add modal
│   │   └── WebsiteDetailPage.jsx # Website overview and integration status placeholder
│   ├── members/
│   │   └── MembersPage.jsx     # Member list, role editing, invite modal, pending invitations
│   └── settings/
│       └── RolesPage.jsx       # Roles & permissions matrix inspection
└── components/
    ├── layout/
    │   ├── AppLayout.jsx       # Authenticated shell: Sidebar, TopBar, WorkspaceSwitcher
    │   ├── Sidebar.jsx         # Primary navigation (Overview, Clients, Websites, Members, Settings)
    │   └── TopBar.jsx          # Active workspace selector, user profile menu, logout
    └── common/
        ├── Modal.jsx           # Reusable accessible dialog
        ├── DataTable.jsx       # Standard agency table with pagination and sorting
        ├── StatusBadge.jsx     # Visual indicator for statuses
        └── EmptyState.jsx      # Clean agency empty state with action triggers
```

---

## 6. API Endpoint Specification (`/api/v1`)

### Authentication (`/auth`)
- `POST /auth/register` — Initial Super Admin registration or invitation-based registration.
- `POST /auth/login` — Authenticate credentials, set HttpOnly refresh cookie, return access JWT + user payload.
- `POST /auth/refresh` — Rotate refresh token, issue new access JWT.
- `POST /auth/logout` — Revoke active refresh session, clear cookie.
- `GET /auth/me` — Return authenticated user profile and memberships.
- `POST /auth/change-password` — Update user password with old password verification.
- `POST /auth/forgot-password` — Generate dev reset link (or send email when configured).
- `POST /auth/reset-password` — Reset password using valid reset token.

### Workspace (`/workspaces`)
- `POST /workspaces` — Create workspace (restricted to Super Admin).
- `GET /workspaces` — List workspaces accessible to current user.
- `GET /workspaces/:workspaceId` — Workspace details.
- `PATCH /workspaces/:workspaceId` — Update workspace settings (name, logo, timezone).
- `GET /workspaces/:workspaceId/stats` — Metrics (total clients, active websites, member count).
- `POST /workspaces/:workspaceId/switch` — Switch active workspace context.

### Members & Invitations (`/workspaces/:workspaceId/members`)
- `GET /workspaces/:workspaceId/members` — List workspace members with roles.
- `PATCH /workspaces/:workspaceId/members/:memberId` — Update member role.
- `DELETE /workspaces/:workspaceId/members/:memberId` — Remove member (owner protected).
- `POST /workspaces/:workspaceId/invitations` — Send invitation.
- `GET /workspaces/:workspaceId/invitations` — List pending invitations.
- `POST /workspaces/:workspaceId/invitations/:invitationId/resend` — Resend invitation.
- `DELETE /workspaces/:workspaceId/invitations/:invitationId` — Revoke invitation.
- `POST /invitations/:token/accept` — Accept invitation and join workspace.

### Roles & Permissions (`/workspaces/:workspaceId/roles`)
- `GET /workspaces/:workspaceId/roles` — List system and workspace roles.
- `GET /workspaces/:workspaceId/permissions` — List all system permissions.
- `POST /workspaces/:workspaceId/roles` — Create custom role.
- `PATCH /workspaces/:workspaceId/roles/:roleId` — Update custom role.
- `DELETE /workspaces/:workspaceId/roles/:roleId` — Delete custom role.

### Clients (`/workspaces/:workspaceId/clients`)
- `POST /workspaces/:workspaceId/clients` — Create client.
- `GET /workspaces/:workspaceId/clients` — List clients with search, status filter, pagination.
- `GET /workspaces/:workspaceId/clients/:clientId` — Client detail.
- `PATCH /workspaces/:workspaceId/clients/:clientId` — Update client metadata.
- `DELETE /workspaces/:workspaceId/clients/:clientId` — Delete client.
- `PATCH /workspaces/:workspaceId/clients/:clientId/archive` — Archive/unarchive client.
- `POST /workspaces/:workspaceId/clients/:clientId/members` — Assign members to client.
- `DELETE /workspaces/:workspaceId/clients/:clientId/members/:userId` — Unassign member from client.

### Websites (`/workspaces/:workspaceId/clients/:clientId/websites`)
- `POST /workspaces/:workspaceId/clients/:clientId/websites` — Register website under client.
- `GET /workspaces/:workspaceId/clients/:clientId/websites` — List websites for client.
- `GET /workspaces/:workspaceId/websites` — List all websites in workspace with filtering.
- `GET /workspaces/:workspaceId/websites/:websiteId` — Website detail.
- `PATCH /workspaces/:workspaceId/websites/:websiteId` — Update website info.
- `DELETE /workspaces/:workspaceId/websites/:websiteId` — Delete website.
- `PATCH /workspaces/:workspaceId/websites/:websiteId/archive` — Archive/unarchive website.

---

## 7. Security Architecture & Controls

1. **Password Security:** Argon2id with memory cost 65536, time cost 3, parallelism 4.
2. **JWT Security:**
   - Short-lived Access Token (15 min) kept in memory in Redux state.
   - Long-lived Refresh Token (7 days) stored in an HttpOnly, Secure, SameSite=Lax/Strict cookie.
   - Separate secrets for access and refresh tokens.
   - SHA-256 hash of refresh tokens stored in database.
3. **Session Management & Token Rotation:**
   - Every refresh generates a new refresh token and invalidates the previous one.
   - Detection of reuse of revoked tokens immediately invalidates all active sessions for that user.
4. **RBAC & Authorization Matrix:**
   - 5 System Roles: Super Admin, Admin, SEO Manager, SEO Executive, Viewer.
   - Granular permissions checked per endpoint (e.g. `clients.create`, `websites.update`, `members.invite`).
   - Owner Protection: Workspace owner cannot be removed, suspended, or demoted.
   - Privilege Escalation Prevention: Admins cannot grant roles higher than their own authority.
5. **Multi-Tenant Isolation:**
   - Every client and website query strictly filters by `workspaceId`.
   - SEO Managers, Executives, and Viewers only access clients assigned to them via `ClientMember`.
6. **Audit Trail:**
   - Sensitive operations (login, user updates, client creations, member invitations, role changes) recorded in `AuditLog`.

---

## 8. Implementation Sequence

- **Step 1:** Update Prisma schema (`schema.prisma`) with new models, enums, relations, and indexes. Validate and generate Prisma client.
- **Step 2:** Create seed script (`prisma/seed.js`) initializing standard permissions, default roles, and super admin account.
- **Step 3:** Implement Auth Utilities & Service (`auth.utils.js`, `auth.service.js`, `auth.validation.js`).
- **Step 4:** Implement Auth Controller and Routes (`auth.controller.js`, `auth.routes.js`).
- **Step 5:** Implement Authentication & RBAC Middleware (`authenticate.js`, `requirePermission.js`).
- **Step 6:** Implement Workspace Module (`workspaces/`).
- **Step 7:** Implement Members & Invitations Module (`members/`).
- **Step 8:** Implement Roles & Permissions Module (`roles/`).
- **Step 9:** Implement Client Management Module (`clients/`).
- **Step 10:** Implement Website Management Module (`websites/`).
- **Step 11:** Connect routes into `backend/src/app.js`.
- **Step 12:** Implement Frontend State & API Layers (RTK Query slices for auth, workspace, clients, websites, members).
- **Step 13:** Implement Frontend Navigation, Layout, and Pages (`AppLayout`, `TopBar`, `Sidebar`, `LoginPage`, `RegisterPage`, `DashboardPage`, `ClientsPage`, `ClientDetailPage`, `WebsitesPage`, `MembersPage`).
- **Step 14:** Implement Automated Tests (Unit & Integration tests for Auth, RBAC, Client/Website tenancy).
- **Step 15:** Verify build, documentation updates, and test suite execution.
