# Missive Digital SEO Intelligence Platform
## Phase 4 Completion Report: Microsoft Clarity Integration

**Date:** November 20, 2026  
**Status:** Completed & Fully Verified  
**Branch / Workspace:** `c:\Users\info\OneDrive\Desktop\SEO-Report\missive-seo-intelligence`  
**Test Suite:** 9/9 Suites Passing, 44/44 Tests Passing (100% Pass Rate)  
**Frontend Build:** Vite v6.4.6 Production Build Passed (0 Errors, 0 Warnings)

---

### 1. Executive Summary & Objective

In Phase 4, we implemented an enterprise-grade, production-quality **Microsoft Clarity Integration** for the Missive Digital SEO Intelligence Platform. This integration enriches the agency's existing organic search intelligence (GA4 and Google Search Console from Phase 3) with deep behavioral UX metrics—specifically rage clicks, dead clicks, excessive scrolling, quickbacks, and client-side JavaScript errors.

The integration strictly follows official Microsoft Clarity architecture:
1. **Token-Based Authentication:** Direct connection via project Data Export API tokens (no OAuth 2.0 redirection, which Microsoft Clarity does not support).
2. **Deterministic Security:** Project tokens encrypted at rest using AES-256-GCM with PBKDF2 key derivation and unique 96-bit IVs. Tokens are never exposed in plaintext, logs, or API responses.
3. **Strict Quota Control:** Enforced local tracking of Microsoft's strict limit of **10 API calls per project per day** with UTC midnight reset and automatic lockouts before exhaustion.
4. **Window Control:** Strict support for official rolling windows (1, 2, or 3 days) without falsified historical date querying.
5. **Raw Provenance & Mathematical Integrity:** Every import stores immutable raw JSON response snapshots in MySQL alongside normalized behavioral metrics. Averages and percentages are never summed across dimensions or time.
6. **Workspace Isolation & RBAC:** Multi-tenant workspace scoping applied to all Clarity connections, project mappings, imports, and offline analytics queries with granular role-based permissions (`integrations.manage`, `integrations.sync`, `websites.view`).

---

### 2. Architecture & API Differences (Clarity vs. Google)

| Architectural Dimension | Google APIs (GA4 & GSC - Phase 3) | Microsoft Clarity (Phase 4) |
| :--- | :--- | :--- |
| **Authentication Flow** | Google OAuth 2.0 with offline refresh tokens | Direct API Token (Data Export Bearer Token) |
| **Discovery Mechanism** | Account Summaries & Site Listing APIs | User provides Project ID & Name (No discovery API) |
| **Official Endpoint** | Google Analytics Data API / Search Console API | `https://www.clarity.ms/export-data/api/v1/project-live-insights` |
| **Rate Limit / Quota** | Per-minute / Per-day token buckets (Generous) | **Strict 10 requests per day per project** |
| **Time Window** | Arbitrary historical date ranges (`YYYY-MM-DD`) | **Rolling windows only (`numOfDays`: 1, 2, or 3)** |
| **Dimension Limits** | Up to 9 dimensions | **Max 3 dimensions per query** |
| **Response Limits** | Standard pagination tokens | Max 1,000 rows, no pagination support |

---

### 3. Database Schema Modifications (Prisma)

The Prisma schema (`backend/prisma/schema.prisma`) was updated with dedicated models and friction metric columns:

#### 3.1. `ClarityConnection`
Workspace-scoped connection storing encrypted API tokens and tracking the 10-call daily quota:
```prisma
model ClarityConnection {
  id                String                  @id @default(uuid())
  workspaceId       String                  @map("workspace_id")
  projectId         String                  @map("project_id")
  projectName       String?                 @map("project_name")
  apiTokenEnc       String                  @map("api_token_enc") @db.Text
  status            IntegrationStatus       @default(CONNECTED)
  apiCallsToday     Int                     @default(0) @map("api_calls_today")
  apiCallsResetAt   DateTime                @default(now()) @map("api_calls_reset_at")
  lastValidatedAt   DateTime                @default(now()) @map("last_validated_at")
  lastSyncAt        DateTime?               @map("last_sync_at")
  lastError         String?                 @map("last_error") @db.Text
  createdAt         DateTime                @default(now()) @map("created_at")
  updatedAt         DateTime                @updatedAt @map("updated_at")

  workspace         Workspace               @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  integrations      IntegrationConnection[]
  snapshots         ClarityImportSnapshot[]

  @@unique([workspaceId, projectId])
  @@index([workspaceId])
}
```

#### 3.2. `ClarityImportSnapshot`
Stores raw immutable API responses for data provenance and zero-data-loss querying:
```prisma
model ClarityImportSnapshot {
  id                  String             @id @default(uuid())
  workspaceId         String             @map("workspace_id")
  websiteId           String             @map("website_id")
  clarityConnectionId String             @map("clarity_connection_id")
  requestedNumOfDays  Int                @map("requested_num_of_days")
  windowStart         DateTime           @map("window_start")
  windowEnd           DateTime           @map("window_end")
  preset              String?
  dimensionsUsed      String?            @map("dimensions_used")
  rawResponseJson     String             @map("raw_response_json") @db.LongText
  rowCount            Int                @default(0) @map("row_count")
  isTruncated         Boolean            @default(false) @map("is_truncated")
  createdAt           DateTime           @default(now()) @map("created_at")

  workspace           Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  website             Website            @relation(fields: [websiteId], references: [id], onDelete: Cascade)
  clarityConnection   ClarityConnection  @relation(fields: [clarityConnectionId], references: [id], onDelete: Cascade)

  @@index([workspaceId, websiteId])
  @@index([createdAt])
}
```

#### 3.3. `ClarityDailyMetric` (Friction Metrics)
Extended with dedicated columns for behavioral analysis:
- `rageClickCount`
- `deadClickCount`
- `excessiveScrollCount`
- `quickbackClickCount`
- `scriptErrorCount`
- `errorClickCount`
- `distinctUsers`
- `botSessions`
- `averageScrollDepth` (weighted float)
- `activeTimeSeconds`

#### 3.4. `ClarityDimensionMetric`
Generic dimension metric store for querying by URL, Device, Browser, OS, Country, Source, Medium:
```prisma
model ClarityDimensionMetric {
  id              String   @id @default(uuid())
  workspaceId     String   @map("workspace_id")
  websiteId       String   @map("website_id")
  date            DateTime @db.Date
  dimensionName   String   @map("dimension_name")
  dimensionValue  String   @map("dimension_value")
  totalSessions   Int      @default(0) @map("total_sessions")
  rageClicks      Int      @default(0) @map("rage_clicks")
  deadClicks      Int      @default(0) @map("dead_clicks")
  excessiveScroll Int      @default(0) @map("excessive_scroll")
  quickbacks      Int      @default(0) @map("quickbacks")
  scriptErrors    Int      @default(0) @map("script_errors")
  createdAt       DateTime @default(now()) @map("created_at")

  @@unique([websiteId, date, dimensionName, dimensionValue])
  @@index([workspaceId, websiteId, dimensionName])
}
```

---

### 4. Backend Modules Implemented

All backend modules are written in clean ES Module JavaScript located in `backend/src/modules/integrations/clarity/`:

1. **`clarity.validation.js`**: Zod validation schemas enforcing strict dimension whitelist (`Browser`, `Device`, `Country/Region`, `OS`, `Source`, `Medium`, `Campaign`, `Channel`, `URL`), maximum 3 dimensions, and valid `numOfDays` (1, 2, or 3).
2. **`clarityClient.service.js`**:
   - Official endpoint: `https://www.clarity.ms/export-data/api/v1/project-live-insights`.
   - Timeout protection (15s request timeout, 20s overall).
   - Injects `Authorization: Bearer <token>`.
   - Error mapping for 401 Unauthorized, 403 Forbidden, 429 Quota Exceeded, and 5xx upstream failures.
3. **`clarityConnection.service.js`**:
   - Validates live token against Microsoft prior to saving.
   - Encrypts token using AES-256-GCM.
   - Enforces daily 10-call quota limit with automatic UTC midnight reset.
   - Sanitizes connection responses so tokens are never leaked to frontend.
4. **`clarityMapping.service.js`**:
   - Links/unlinks Clarity projects with client websites under workspace tenant isolation.
   - Automatically maintains `IntegrationConnection` records (`integrationType: 'CLARITY'`).
5. **`clarityImport.service.js`**:
   - Executes metric imports across predefined presets:
     - `OVERVIEW`: High-level session metrics and friction indicators.
     - `DEVICE`: Dimension `Device` for mobile vs. desktop UX comparison.
     - `BROWSER`: Dimension `Browser` for cross-browser UX bugs.
     - `COUNTRY`: Dimension `Country/Region` for geographic friction analysis.
     - `URL`: Dimension `URL` for landing page rage/dead click detection.
     - `ACQUISITION`: Dimensions `Source`, `Medium`, `Channel` for campaign UX inspection.
   - Stores raw response snapshot in `ClarityImportSnapshot`.
   - Deterministically updates `ClarityDailyMetric`, `ClarityDeviceMetric`, `ClarityCountryMetric`, `ClarityPageMetric`, and `ClarityDimensionMetric`.
   - Records `SyncHistory` and `AuditLog` events.
6. **`clarityData.service.js`**:
   - Provides 100% offline querying of stored behavioral data from MySQL.
   - Calculates aggregated friction rates:
     - Rage click session rate (`rageClickSessions / totalSessions`)
     - Dead click session rate (`deadClickSessions / totalSessions`)
     - Quickback rate (`quickbackSessions / totalSessions`)
     - Script error session rate (`scriptErrorSessions / totalSessions`)
   - Retrieves paginated snapshots and detailed raw payload inspector.
7. **`clarity.controller.js` & `clarity.routes.js`**:
   - REST endpoints with RBAC middleware (`integrations.manage`, `integrations.sync`, `websites.view`).
   - Tenant isolation verification on every route.

---

### 5. API Endpoints Specification

| Method | Endpoint | RBAC Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces/:workspaceId/clarity/connections` | `integrations.manage` | List all connected Clarity projects in workspace |
| `POST` | `/api/v1/workspaces/:workspaceId/clarity/connections` | `integrations.manage` | Validate and connect a new Clarity project |
| `PUT` | `/api/v1/workspaces/:workspaceId/clarity/connections/:connectionId/token` | `integrations.manage` | Rotate/replace an API token |
| `DELETE` | `/api/v1/workspaces/:workspaceId/clarity/connections/:connectionId` | `integrations.manage` | Disconnect project and remove encrypted token |
| `POST` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/integrations/clarity` | `integrations.manage` | Map website to a connected Clarity project |
| `DELETE` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/integrations/clarity` | `integrations.manage` | Unlink website from Clarity (retains historical data) |
| `POST` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/clarity/import` | `integrations.sync` | Trigger manual data import (1-3 days window) |
| `GET` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/clarity/snapshots` | `websites.view` | List historical import snapshots (provenance) |
| `GET` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/clarity/snapshots/:id` | `websites.view` | View full raw JSON response of a snapshot |
| `GET` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/analytics/clarity` | `websites.view` | Query stored friction metrics & device/page breakdowns |

---

### 6. Frontend Components & UI Capabilities

All frontend features were built with React, Tailwind CSS, Lucide icons, and RTK Query:

1. **`integrationsApi.js`**: Added all RTK Query endpoints and cache invalidation tags (`ClarityConnections`, `ClaritySnapshots`, `WebsiteIntegrations`, `WebsiteAnalytics`).
2. **`ConnectClarityModal.jsx`**:
   - Guidance modal explaining where to generate tokens in Microsoft Clarity (`Settings -> Data Export -> Generate API Token`).
   - Live token validation during submission with clear feedback.
3. **`ClarityMapModal.jsx`**:
   - Allows linking any authorized Clarity project in the workspace to the target client website.
4. **`ClaritySyncModal.jsx`**:
   - Rolling window selector (1 day, 2 days, or 3 days).
   - Preset selector (Overview, Device, Browser, Country, URL, Acquisition).
   - Live warning banner regarding Microsoft's 10 calls/day quota.
   - Shows import results (rows imported, snapshot ID) immediately upon completion.
5. **`ClarityMetricsView.jsx`**:
   - **Behavioral Friction KPI Grid:** Rage Clicks, Dead Clicks, Quickbacks, Excessive Scrolling, Script Errors, and Total Sessions.
   - **Engagement Cards:** Scroll Depth percentage and Average Active Time.
   - **Landing Page Friction Table:** Dead click rates and rage click rates per page URL.
   - **Device Friction Breakdown:** Comparison across Desktop, Mobile, and Tablet.
   - **Snapshot Provenance Drawer / Modal:** Allows inspecting immutable raw JSON payloads received from Microsoft Clarity.
6. **`IntegrationsPage.jsx`**:
   - Displays Microsoft Clarity alongside Google Analytics 4 and Google Search Console.
   - Shows daily call counter (`x/10 calls used today`) and project status.
   - Connect, rotate token, and disconnect modals.
7. **`WebsiteDetailPage.jsx`**:
   - Replaced Phase 4 placeholder with active Microsoft Clarity card.
   - Integrated tab navigation: "Analytics Integrations", "Stored SEO Intelligence (Offline)", and "Behavioral Analytics (Clarity)".
   - Connected `ClarityMapModal` and `ClaritySyncModal` triggers.

---

### 7. Verification & Test Results

#### 7.1. Backend Test Suite
Executed all unit and integration tests:
```bash
npm --prefix missive-seo-intelligence/backend test
```
**Results:**
- `PASS tests/unit/sessionSecurity.test.js`
- `PASS tests/unit/rbac.test.js`
- `PASS tests/integration/tenantIsolation.test.js`
- `PASS tests/unit/encryption.test.js`
- `PASS tests/integration/auth.service.test.js`
- `PASS tests/unit/website.validation.test.js`
- `PASS tests/unit/auth.utils.test.js`
- `PASS tests/integration/clarity.test.js` (Dimension validator, AES-256 token encryption, 10-call quota limit enforcement, website mapping, offline analytics calculation)
- `PASS tests/integration/integrations.test.js` (GA4 & GSC integrations)

**Summary:** `Test Suites: 9 passed, 9 total | Tests: 44 passed, 44 total | Time: 8.402 s`

#### 7.2. Frontend Production Build
Executed Vite production build:
```bash
npm --prefix missive-seo-intelligence/frontend run build
```
**Results:**
- `✓ 2068 modules transformed.`
- `dist/assets/IntegrationsPage-DZ-JSFsM.js 15.65 kB`
- `dist/assets/WebsiteDetailPage-Dn6yD1xw.js 460.62 kB`
- `✓ built in 11.87s` (0 errors, 0 warnings)

---

### 8. Architectural Integrity & Next Phase Readiness

- **Backward Compatibility:** All Phase 1 (Core Multi-Tenancy & RBAC), Phase 2 (Authentication & Agency Management), and Phase 3 (Google OAuth 2.0, GA4 & GSC) features remain 100% operational without regression.
- **Phase 5 Readiness (Redis & BullMQ Scheduled Sync):** The `clarityImportService.runPresetImport()` method is designed as a standalone pure job processor, ready to be called from a BullMQ worker queue in Phase 5.
- **Phase 6 Readiness (Local AI & MCP Server):** Stored Clarity friction data (`ClarityDailyMetric`, `ClarityDimensionMetric`, `ClarityImportSnapshot`) is fully indexed in MySQL, providing immediate offline context for the local Ollama Qwen model and Model Context Protocol (MCP) server.
