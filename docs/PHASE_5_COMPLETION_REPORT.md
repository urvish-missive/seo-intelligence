# Missive Digital SEO Intelligence Platform
## Phase 5 Completion Report: Redis, BullMQ & Automated Background Data Synchronisation

**Date:** November 20, 2026  
**Status:** Completed & Verified  
**Branch / Workspace:** `c:\Users\info\OneDrive\Desktop\SEO-Report\missive-seo-intelligence`  
**Test Suite:** 10/10 Test Suites Passing, 53/53 Tests Passing (100% Pass Rate)  
**Frontend Build:** Vite v6.4.6 Production Build Passed (0 Errors, 0 Warnings)

---

### 1. Executive Summary & Objective

In Phase 5, we engineered a scalable, non-blocking background data synchronisation architecture for the Missive Digital SEO Intelligence Platform using **Redis** and **BullMQ**. This architecture automates recurring data retrieval across **Google Analytics 4**, **Google Search Console**, and **Microsoft Clarity**, stores incremental analytics in local MySQL, enforces database-level idempotency, and protects upstream API quotas.

Key capabilities delivered:
1. **Queue & Worker Architecture:** Built with `bullmq` and `ioredis`, featuring concurrency management (concurrency: 5), exponential backoff for transient errors, and job timeout protection.
2. **Graceful Degradation:** If Redis is temporarily unreachable, the platform degrades gracefully to direct asynchronous background execution without crashing the Express server.
3. **Automated Recurring Scheduling:** Backed by database records (`SyncSchedule`) and `node-cron`, supporting custom frequencies (every 24h, 12h, 6h) that survive application restarts.
4. **Idempotency & Concurrency Guard:** A distributed mutex lock (`SyncLockService`) prevents duplicate concurrent sync executions per website and provider using Redis `SET NX` with automatic TTL expiration.
5. **Clarity Quota Safety:** Enforces atomic quota reservation before job dispatch, preventing multiple simultaneous workers from exceeding Microsoft's strict 10 requests/day per project limit. HTTP 429 quota errors are never retried in an infinite loop.
6. **Unified Monitoring UI:** A dedicated "Background Sync & Queues" dashboard tab in the frontend displaying real-time job execution history, records processed, schedule settings, and Redis health.

---

### 2. Implemented Architecture

```
                                  ┌────────────────────────┐
                                  │      Client UI         │
                                  │  (RTK Query Polling)   │
                                  └───────────┬────────────┘
                                              │ REST API
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Express Backend API                             │
│                                                                             │
│  [SyncController] ──> [SyncOrchestratorService] ──> [SyncLockService]       │
│                                │                                            │
│            ┌───────────────────┴────────────────────┐                       │
│            ▼ (If Redis Ready)                       ▼ (If Redis Offline)    │
│    [BullMQ SyncQueue]                       [Direct Async Runner]           │
│            │                                        │                       │
└────────────┼────────────────────────────────────────┼───────────────────────┘
             │                                        │
             ▼                                        ▼
┌─────────────────────────┐               ┌───────────────────────────────────┐
│     Redis 7 (BullMQ)    │               │         Sync Processors           │
│   (Queue: missive-sync) │               │   - GA4DataService (Analytics)    │
│                         │               │   - GSCDataService (Search Console│
└────────────┬────────────┘               │   - ClarityImportService (UX)     │
             │                                └─────────────────┬─────────────────┘
             ▼                                                  │
┌─────────────────────────┐                                     │
│       SyncWorker        │─────────────────────────────────────┘
│ (Concurrency: 5, Retry) │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MySQL Database (Prisma)                          │
│                                                                             │
│  • SyncJob (status, dates, records)      • GA4DailyMetric, GA4LandingPage   │
│  • SyncSchedule (recurring intervals)    • GSCDailyMetric, GSCQueryMetric   │
│  • SyncCheckpoint (last successful date) • ClarityDailyMetric, Snapshots    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Database Schema Modifications (Prisma)

The Prisma schema (`backend/prisma/schema.prisma`) was updated and Prisma Client v6.19.3 regenerated:

#### 3.1. `SyncJob` (Enhanced)
```prisma
model SyncJob {
  id             String          @id @default(uuid())
  workspaceId    String?         @map("workspace_id")
  clientId       String?         @map("client_id")
  connectionId   String
  websiteId      String
  provider       IntegrationType?
  jobType        SyncJobType
  status         SyncJobStatus   @default(PENDING)
  bullmqJobId    String?         @db.VarChar(255)
  dateRangeStart String?         @db.VarChar(10)
  dateRangeEnd   String?         @db.VarChar(10)
  recordsFetched Int             @default(0) @map("records_fetched")
  recordsStored  Int             @default(0) @map("records_stored")
  priority       Int             @default(0)
  attempts       Int             @default(0)
  maxAttempts    Int             @default(3)
  scheduledAt    DateTime?
  startedAt      DateTime?
  completedAt    DateTime?
  error          String?         @db.Text
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  website    Website?              @relation(fields: [websiteId], references: [id], onDelete: Cascade)
  connection IntegrationConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  history    SyncHistory[]

  @@map("sync_jobs")
  @@index([connectionId])
  @@index([websiteId])
  @@index([status])
  @@index([jobType])
  @@index([scheduledAt])
  @@index([workspaceId])
}
```

#### 3.2. `SyncSchedule` (New)
Persists recurring sync schedules across workspaces and websites:
```prisma
model SyncSchedule {
  id              String          @id @default(uuid())
  workspaceId     String          @map("workspace_id")
  websiteId       String          @map("website_id")
  connectionId    String?         @map("connection_id")
  provider        IntegrationType
  enabled         Boolean         @default(true)
  cronExpression  String?         @map("cron_expression") @db.VarChar(50)
  intervalMinutes Int             @default(1440) @map("interval_minutes")
  timezone        String          @default("UTC") @db.VarChar(50)
  lastRunAt       DateTime?       @map("last_run_at")
  nextRunAt       DateTime?       @map("next_run_at")
  lastStatus      SyncJobStatus?  @map("last_status")
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  workspace       Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  website         Website         @relation(fields: [websiteId], references: [id], onDelete: Cascade)

  @@unique([websiteId, provider])
  @@map("sync_schedules")
  @@index([workspaceId])
  @@index([websiteId])
  @@index([enabled])
}
```

#### 3.3. `SyncCheckpoint` (New)
Tracks incremental progress per website and provider:
```prisma
model SyncCheckpoint {
  id                   String          @id @default(uuid())
  websiteId            String          @map("website_id")
  connectionId         String?         @map("connection_id")
  provider             IntegrationType
  lastSuccessfulDate   String?         @map("last_successful_date") @db.VarChar(10)
  lastSuccessfulSyncAt DateTime?       @map("last_successful_sync_at")
  syncMetadataJson     String?         @map("sync_metadata_json") @db.Text
  createdAt            DateTime        @default(now()) @map("created_at")
  updatedAt            DateTime        @updatedAt @map("updated_at")

  website              Website         @relation(fields: [websiteId], references: [id], onDelete: Cascade)

  @@unique([websiteId, provider])
  @@map("sync_checkpoints")
  @@index([websiteId])
}
```

---

### 4. Files Created and Modified

#### Backend:
- [docker-compose.yml](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/docker-compose.yml) — Containerized Redis 7 Alpine with persistent volume and healthcheck for local dev.
- [backend/src/config/redis.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/config/redis.js) — Enterprise `ioredis` client with retry strategies, TLS, connection URL, health ping, and graceful shutdown.
- [backend/src/utils/redisHealth.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/utils/redisHealth.js) — Connection health summary utility.
- [backend/src/queues/queue.config.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/queues/queue.config.js) — BullMQ queue names, Redis options, and exponential backoff configuration.
- [backend/src/queues/sync.queue.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/queues/sync.queue.js) — BullMQ Queue producer (`addSyncJob`, `getJobStatus`, `cancelSyncJob`).
- [backend/src/workers/sync.worker.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/workers/sync.worker.js) — BullMQ Worker with concurrency of 5, distributed locking, error classification, and checkpoint persistence.
- [backend/src/services/sync/syncLock.service.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/services/sync/syncLock.service.js) — Distributed mutex lock preventing simultaneous sync executions.
- [backend/src/services/sync/syncOrchestrator.service.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/services/sync/syncOrchestrator.service.js) — Master sync coordinator with tenant isolation, pre-flight checks, and direct async fallback.
- [backend/src/services/sync/syncScheduler.service.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/services/sync/syncScheduler.service.js) — Restart-resilient cron scheduler loading `SyncSchedule` records from database.
- [backend/src/modules/sync/sync.controller.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/modules/sync/sync.controller.js) — REST API controller.
- [backend/src/modules/sync/sync.routes.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/modules/sync/sync.routes.js) — REST routes with RBAC protection (`integrations.sync`, `integrations.manage`, `websites.view`).
- [backend/tests/unit/sync.test.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/tests/unit/sync.test.js) — Automated Jest unit test suite for queues, locks, backoff, and orchestrator.
- [backend/src/app.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/app.js) — Mounted `syncRoutes` under `/api/v1`.
- [backend/src/server.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/server.js) — Worker initialization and graceful shutdown integration.
- [backend/src/config/environment.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/backend/src/config/environment.js) — Added `REDIS_USERNAME`, `REDIS_TLS`, and `REDIS_URL`.
- [.env.example](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/.env.example) — Documented Redis environment variables.

#### Frontend:
- [frontend/src/features/api/baseApi.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/frontend/src/features/api/baseApi.js) — Added cache tags: `'SyncStatus'`, `'SyncSchedules'`, `'SyncJobs'`.
- [frontend/src/features/integrations/integrationsApi.js](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/frontend/src/features/integrations/integrationsApi.js) — Added RTK Query hooks for background sync triggers, statuses, history, retries, and schedule management.
- [frontend/src/features/sync/components/SyncScheduleModal.jsx](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/frontend/src/features/sync/components/SyncScheduleModal.jsx) — Schedule configuration modal for recurring auto-sync intervals.
- [frontend/src/features/sync/components/SyncManagementView.jsx](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/frontend/src/features/sync/components/SyncManagementView.jsx) — Complete background sync dashboard tab with real-time job execution history, records processed, retry actions, and live Clarity quota meter.
- [frontend/src/pages/websites/WebsiteDetailPage.jsx](file:///C:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/frontend/src/pages/websites/WebsiteDetailPage.jsx) — Added 4th navigation tab: **"Background Sync & Queues"**.

---

### 5. API Endpoints Specification

| Method | Endpoint | RBAC Permission | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/sync/trigger` | `integrations.sync` | Queue or initiate a background sync task |
| `GET` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/sync/status` | `websites.view` | Real-time provider sync status and checkpoints |
| `GET` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/sync/history` | `websites.view` | Paginated sync job audit log and records processed |
| `POST` | `/api/v1/workspaces/:workspaceId/sync/jobs/:jobId/retry` | `integrations.sync` | Re-queue a failed sync job |
| `POST` | `/api/v1/workspaces/:workspaceId/sync/jobs/:jobId/cancel` | `integrations.sync` | Cancel an active or pending background job |
| `GET` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/sync/schedules` | `websites.view` | List recurring automated sync schedules |
| `PUT` | `/api/v1/workspaces/:workspaceId/websites/:websiteId/sync/schedules/:provider` | `integrations.manage` | Update schedule frequency and active status |
| `GET` | `/api/v1/sync/health` | Public / System | Health check for Redis and BullMQ readiness |

---

### 6. Verification & Test Results

#### 6.1. Full Backend Test Suite (`npm test`)
Executed all unit and integration test suites:
```
PASS tests/unit/sessionSecurity.test.js
PASS tests/unit/rbac.test.js
PASS tests/integration/tenantIsolation.test.js
PASS tests/integration/auth.service.test.js
PASS tests/unit/encryption.test.js
PASS tests/unit/website.validation.test.js
PASS tests/unit/auth.utils.test.js
PASS tests/integration/clarity.test.js
PASS tests/integration/integrations.test.js
PASS tests/unit/sync.test.js

Test Suites: 10 passed, 10 total
Tests:       53 passed, 53 total (100% pass rate)
Snapshots:   0 total
Time:        8.478 s
```

#### 6.2. Frontend Production Build (`npm run build`)
Executed Vite production build:
```
✓ 2070 modules transformed.
dist/assets/integrationsApi-BtKSNXKE.js        10.01 kB
dist/assets/WebsiteDetailPage-BojjUdlD.js     474.78 kB
dist/assets/index-Dta4CFGH.js                 297.78 kB
✓ built in 8.14s (0 errors, 0 warnings)
```

---

### 7. How to Run Redis and Workers Locally

#### Starting Redis via Docker:
```bash
# In project root:
docker compose up -d redis

# Verify Redis is running:
docker compose ps
docker compose exec redis redis-cli ping
# Output: PONG
```

#### Stopping Redis:
```bash
docker compose down
```

#### Running Workers:
When the backend starts (`npm run dev`), it automatically connects to Redis, starts the BullMQ `SyncWorker` (listening on queue `missive-seo-sync`), and initializes the `SyncSchedulerService`. If Redis is offline, it issues a non-blocking warning and processes background sync jobs via direct asynchronous execution.

---

### 8. Readiness for Phase 6 (Local AI & MCP Server)
With Phase 5 complete, all SEO and behavioral data across GA4, Google Search Console, and Microsoft Clarity is automatically ingested, normalized, and updated on a recurring schedule in local MySQL. This provides a rich, fresh, local dataset for:
1. **Phase 6:** Ollama running the local Qwen model for automated SEO opportunity analysis, traffic drop diagnosis, and landing page UX auditing.
2. **Phase 6:** Model Context Protocol (MCP) server exposing tools to query the locally stored intelligence.
