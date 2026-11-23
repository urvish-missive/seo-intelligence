# Phase 3 Completion Report — Google OAuth 2.0, GA4 & Google Search Console
**Missive Digital SEO Intelligence Platform**
*Date: 2026-11-20*

---

## 1. Executive Summary

Phase 3 is complete, fully functional, and verified. The platform now possesses a production-grade Google integration foundation enabling workspace members to:
1. Connect centralized agency/client Google Accounts via OAuth 2.0.
2. Securely store and encrypt OAuth tokens locally using AES-256-GCM authenticated encryption.
3. Automatically discover GA4 properties via the Google Analytics Admin API (v1beta).
4. Automatically discover verified sites via the Google Search Console API (v1).
5. Associate discovered GA4 and GSC properties with client websites under strict workspace tenant isolation.
6. Trigger manual data imports from Google Analytics 4 and Google Search Console across configurable date ranges.
7. Persist daily metrics, top organic queries (keywords), landing pages, traffic sources, devices, and country data into local MySQL database tables.
8. Query and view stored SEO metrics with 100% offline availability (zero external Google API calls needed once stored).
9. Manage integrations and visual analytics through an intuitive, interactive React web dashboard.

All 8 test suites (36 tests) are passing, and the frontend Vite production build is verified with zero errors.

---

## 2. Architecture & Database Design

### Enterprise Multi-Site OAuth Architecture
In marketing agency operations, an agency Google account typically administers dozens of GA4 properties and verified Search Console sites across many client domains. 

Binding OAuth credentials directly to individual websites would force the agency to re-authenticate with Google twice for every single website, rapidly exhausting Google's 50 refresh-token-per-user limit.

To solve this, Phase 3 implements a **Workspace-Level Google Account Model**:
- One or more Google accounts can be linked to a Workspace.
- Any website inside that workspace can associate with any GA4 property or GSC site discovered on those connected accounts.
- Token refresh happens centrally, automatically keeping all linked websites synchronized.

### Database Schema Updates (`backend/prisma/schema.prisma`)

```prisma
enum OAuthStatus {
  CONNECTED
  EXPIRED
  REVOKED
}

model GoogleAccount {
  id               String                 @id @default(uuid())
  workspaceId      String
  googleId         String                 @db.VarChar(255)
  email            String                 @db.VarChar(255)
  displayName      String?                @db.VarChar(255)
  avatarUrl        String?                @db.VarChar(500)
  accessTokenEnc   String                 @db.Text
  refreshTokenEnc  String                 @db.Text
  tokenExpiresAt   DateTime?
  scopes           String                 @db.Text
  status           OAuthStatus            @default(CONNECTED)
  lastRefreshedAt  DateTime?
  createdAt        DateTime               @default(now())
  updatedAt        DateTime               @updatedAt

  workspace        Workspace              @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  integrations     IntegrationConnection[]

  @@unique([workspaceId, email])
  @@map("google_accounts")
  @@index([workspaceId])
  @@index([email])
}

model IntegrationConnection {
  id                    String            @id @default(uuid())
  websiteId             String
  workspaceId           String
  googleAccountId       String?
  integrationType       IntegrationType   // GA4, GSC, CLARITY
  status                IntegrationStatus @default(NOT_CONNECTED)
  selectedProperty      String?           @db.VarChar(500)
  selectedPropertyName  String?           @db.VarChar(255)
  credentialsEnc        String?           @db.Text
  lastSyncAt            DateTime?
  lastSyncStatus        SyncJobStatus?
  lastError             String?           @db.Text
  nextScheduledSync     DateTime?
  syncIntervalMinutes   Int               @default(360)
  isHistoricalComplete  Boolean           @default(false)
  historicalStartDate   String?           @db.VarChar(10)
  createdAt             DateTime          @default(now())
  updatedAt             DateTime          @updatedAt

  website       Website        @relation(fields: [websiteId], references: [id], onDelete: Cascade)
  googleAccount GoogleAccount? @relation(fields: [googleAccountId], references: [id], onDelete: SetNull)
  oauthAccount  OAuthAccount?
  syncJobs      SyncJob[]
  syncHistory   SyncHistory[]
  apiUsage      ApiUsage[]

  @@unique([websiteId, integrationType])
  @@map("integration_connections")
  @@index([websiteId])
  @@index([workspaceId])
  @@index([googleAccountId])
}
```

---

## 3. Cryptographic Security Engine (`backend/src/utils/encryption.js`)

All credentials and OAuth tokens are secured using authenticated symmetric encryption:
- **Algorithm**: `AES-256-GCM` with a 32-byte secret key (`ENCRYPTION_KEY` in `.env`).
- **Initialization Vector**: Fresh cryptographically random 16-byte IV generated per encryption.
- **Integrity Verification**: 16-byte GCM authentication tag verified during decryption; ciphertext tampering causes immediate rejection.
- **Storage Format**: `iv_hex:authTag_hex:ciphertext_hex`.
- **OAuth State Protection**: Cryptographic HMAC-SHA256 signature binding `workspaceId`, `userId`, a random nonce, and a 15-minute expiration timestamp to neutralize CSRF attacks during the OAuth consent callback.

---

## 4. Backend Implementation Modules

### Google Integration Services
1. `backend/src/modules/integrations/google/googleClient.factory.js`:
   - Centralizes `google.auth.OAuth2` client creation.
   - Proactively refreshes tokens expiring within 5 minutes.
   - Listens to automatic token refresh events from `google-auth-library` and persists new tokens to MySQL.
   - Handles `invalid_grant` revocation gracefully by updating `GoogleAccount.status = 'REVOKED'`.
2. `backend/src/modules/integrations/google/googleAuth.service.js`:
   - `generateAuthorizationUrl`: Generates consent URL requesting `analytics.readonly`, `webmasters.readonly`, and userinfo scopes with cryptographic state.
   - `handleCallback`: Validates HMAC state, exchanges code for tokens, retrieves Google profile, encrypts tokens, and upserts `GoogleAccount`.
   - `listAccounts`: Returns connected Google accounts with safe metadata (zero plaintext or encrypted tokens leaked).
   - `disconnectAccount`: Revokes tokens with Google, updates linked website integration records, and creates audit log entries.
3. `backend/src/modules/integrations/ga4/ga4Admin.service.js`:
   - Uses `analyticsadmin.accountSummaries.list()` to discover all accessible GA4 properties.
4. `backend/src/modules/integrations/gsc/gscAdmin.service.js`:
   - Uses `searchconsole.sites.list()` to discover all verified Search Console properties (`sc-domain:...` and URL-prefix).
5. `backend/src/modules/integrations/websiteIntegration.service.js`:
   - Connects, switches, or disconnects GA4 and GSC properties for a specific client website.
   - Guarantees standard integration status slots (`GA4`, `GSC`, `CLARITY`) are consistently present.
6. `backend/src/modules/integrations/ga4/ga4Data.service.js`:
   - Queries `analyticsdata.properties.runReport()` for daily metrics, organic search sessions, top landing pages, traffic sources, devices, and countries.
   - Performs transactional upserts into `GA4DailyMetric`, `GA4LandingPageMetric`, `GA4TrafficSourceMetric`, `GA4DeviceMetric`, `GA4CountryMetric`.
   - Records detailed sync history in `SyncHistory`.
7. `backend/src/modules/integrations/gsc/gscData.service.js`:
   - Queries `searchconsole.searchanalytics.query()` for aggregate daily metrics, top keywords (queries), top landing pages, devices, and countries.
   - Performs transactional upserts into `GSCDailyMetric`, `GSCQueryMetric`, `GSCPageMetric`, `GSCDeviceMetric`, `GSCCountryMetric`.
   - Records detailed sync history in `SyncHistory`.
8. `backend/src/modules/analytics/analyticsData.service.js`:
   - Queries stored records locally from MySQL without external API calls.
   - Aggregates metrics, calculates CTR and weighted positions, builds combined daily time-series, and serves top query and page rankings.

---

## 5. API Endpoints Reference

### Google OAuth & Account Management
| Method | Endpoint | Permissions | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces/:workspaceId/integrations/google/auth-url` | `integrations.manage` | Generate Google OAuth2 authorization URL |
| `GET` | `/api/v1/integrations/google/callback` | Public | Google OAuth redirect callback handler |
| `GET` | `/api/v1/workspaces/:workspaceId/integrations/google/accounts` | `integrations.view` | List connected Google accounts in workspace |
| `DELETE` | `/api/v1/workspaces/:workspaceId/integrations/google/accounts/:accountId` | `integrations.manage` | Disconnect Google account from workspace |

### Property Discovery
| Method | Endpoint | Permissions | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces/:workspaceId/integrations/google/accounts/:accountId/ga4-properties` | `integrations.view` | Discover accessible GA4 properties |
| `GET` | `/api/v1/workspaces/:workspaceId/integrations/google/accounts/:accountId/gsc-sites` | `integrations.view` | Discover verified GSC sites |

### Website Integration Binding & Manual Sync
| Method | Endpoint | Permissions | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/integrations` | `integrations.view` | Get website integration connection statuses |
| `POST` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/integrations/connect` | `integrations.manage` | Bind GA4 or GSC property to website |
| `POST` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/integrations/disconnect` | `integrations.manage` | Unbind GA4 or GSC property from website |
| `POST` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/integrations/sync` | `integrations.sync` | Trigger manual data import for GA4 or GSC |

### Local Stored Analytics (Offline)
| Method | Endpoint | Permissions | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/analytics/overview` | `websites.view` | Aggregate performance totals & daily chart series |
| `GET` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/analytics/queries` | `websites.view` | Top organic search keywords from local database |
| `GET` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/analytics/pages` | `websites.view` | Top landing pages from local database |
| `GET` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/analytics/sync-history` | `websites.view` | Audit log of data sync executions |

---

## 6. Frontend Modules & UI Components

1. **`IntegrationsPage.jsx` (`/settings/integrations`)**:
   - Central hub for managing agency Google accounts.
   - Shows connected Google accounts with email, name, avatar, status badges, and active website link counts.
   - "Connect Google Account" OAuth trigger with automated callback redirect handling.
   - Safe disconnect modal with impact advisory.
2. **`WebsiteDetailPage.jsx` Enhancements**:
   - Tab 1: **Analytics Integrations**:
     - Real-time connection status badges for GA4 and GSC.
     - Bound account and property names with last synced timestamps.
     - Action buttons: "Connect GA4 / GSC", "Change Property", "Import Data", "Disconnect".
   - Tab 2: **Stored SEO Intelligence (Offline)**:
     - Embedded `StoredMetricsView.jsx` presenting KPI metric cards (GA4 sessions, organic sessions, conversions; GSC clicks, impressions, CTR, position).
     - Interactive daily trend line chart using Recharts.
     - Top search queries table with click and position ranking.
     - Top landing pages table with sessions and user counts.
     - Sync execution history table.
3. **`PropertySelectModal.jsx`**:
   - Two-step selector: Choose authorized Google account -> Auto-discover properties -> Auto-highlight recommended properties matching the website's domain -> Save association.
4. **`ManualSyncModal.jsx`**:
   - Quick date presets (Last 7 Days, Last 30 Days, Last 90 Days) and custom date pickers.
   - Real-time progress spinner and completion summary (rows fetched, inserted, duration).

---

## 7. Verification & Test Summary

- **Backend Unit & Integration Tests**: 8 test suites, 36 tests passing (100% pass rate).
  - `tests/unit/encryption.test.js`: AES-256-GCM encryption, decryption, corruption detection, and OAuth HMAC state validation.
  - `tests/integration/integrations.test.js`: Website property binding, multi-site isolation, and offline analytics query aggregation.
  - `tests/integration/auth.service.test.js`, `tenantIsolation.test.js`, `rbac.test.js`, `sessionSecurity.test.js`, `website.validation.test.js`.
- **Frontend Build**: Vite 6 build completed in 8.56s with 2,064 modules transformed and 0 errors.

---

## 8. Ready for Next Phase

Phase 3 is fully operational and provides the data ingestion foundation required for:
- **Phase 4**: Microsoft Clarity Integration (User experience metrics, dead clicks, rage clicks, scroll depth).
- **Phase 5**: Automated Background Job Scheduling with Redis & BullMQ.
- **Phase 6 & 8**: SEO Performance Engine & Local AI Inference with Ollama (Qwen models).
