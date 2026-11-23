# Phase 5 Implementation Plan: Redis, BullMQ & Automated Background Data Synchronisation

**Date:** November 20, 2026  
**Status:** In Progress (Step 1 Completed)  
**Author:** Senior Full-Stack Software Architect & Background Processing Specialist  
**Project:** Missive Digital SEO Intelligence Platform  

---

## 1. Executive Summary & Existing Architecture Audit

Following the successful completion of **Phase 1** (Multi-Tenancy & RBAC), **Phase 2** (Authentication & Agency Management), **Phase 3** (Google OAuth 2.0, GA4 & GSC), and **Phase 4** (Microsoft Clarity Integration), the platform stores credentials with AES-256-GCM encryption and provides manual on-demand data imports.

**Phase 5 Objective:** Build an industrial-grade, resilient, non-blocking background data synchronisation engine using **Redis** and **BullMQ**. This engine will handle scheduled automated daily syncs, controlled manual sync triggers, incremental backfills, and retry management across all three supported analytics providers (Google Analytics 4, Google Search Console, and Microsoft Clarity) without duplicating code or creating database race conditions.

---

## 2. What Is Already Available

1. **`bullmq` (^5.34.5) & `ioredis` (^5.4.2):**
   - Installed in `backend/package.json` dependencies and verified in `node_modules`.
2. **Redis Connection Configuration:**
   - `backend/src/config/redis.js` provides a non-blocking `ioredis` client with reconnection strategies (`maxRetriesPerRequest: null`, required by BullMQ) and connection state listeners.
3. **Environment Configuration (`backend/src/config/environment.js`):**
   - Already validates `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `DEFAULT_SYNC_INTERVAL_MINUTES`, `MAX_SYNC_RETRIES`, `SYNC_RETRY_DELAY_MS`.
4. **Integration Services:**
   - **GA4:** `ga4DataService.importGA4Data({ workspaceId, websiteId, startDate, endDate, user })` fetches daily metrics, landing pages, and traffic sources.
   - **GSC:** `gscDataService.importGSCData({ workspaceId, websiteId, startDate, endDate, user })` fetches search queries, pages, device, and country performance.
   - **Clarity:** `clarityImportService.executeManualImport({ workspaceId, websiteId, numOfDays, preset, user })` and `clarityConnectionService.checkAndIncrementQuota()` enforce the 10-call daily quota limit and store raw snapshots.
5. **Analytics Storage Models in MySQL (Prisma):**
   - `GA4DailyMetric`, `GA4LandingPageMetric`, `GA4TrafficSourceMetric`
   - `GSCDailyMetric`, `GSCQueryMetric`, `GSCPageMetric`, `GSCCountryMetric`, `GSCDeviceMetric`
   - `ClarityDailyMetric`, `ClarityPageMetric`, `ClarityDeviceMetric`, `ClarityCountryMetric`, `ClarityDimensionMetric`, `ClarityImportSnapshot`
   - `IntegrationConnection`, `SyncJob` (basic structure), `SyncHistory`
6. **Credential Security:**
   - AES-256-GCM authenticated encryption in `backend/src/utils/encryption.js`.

---

## 3. What Can Be Reused

1. **Provider Data Retrieval:**
   - BullMQ worker processors will call the existing `ga4DataService`, `gscDataService`, and `clarityImportService` directly. No API client logic will be duplicated inside worker threads.
2. **Idempotency Models:**
   - Existing composite unique keys on MySQL metric tables (`[websiteId, date]`, `[websiteId, date, query]`, `[websiteId, date, landingPage]`) guarantee database-level idempotency on re-syncs.
3. **Multi-Tenancy & RBAC:**
   - Existing permissions (`integrations.sync`, `integrations.manage`, `websites.view`) and `requireWorkspace` middleware will protect all sync API endpoints.
4. **Audit Logging:**
   - `auditService.log()` will record background sync trigger, completion, failure, and schedule change events.

---

## 4. What Needs to Be Added

### 4.1. Infrastructure & Queues (`backend/src/queues/` & `backend/src/workers/`)
- `docker-compose.yml` (and `docker-compose.redis.yml`) for local Docker Redis execution.
- `backend/src/queues/queue.config.js`: Centralized Redis connection settings and job defaults (exponential backoff, retry caps, retention rules).
- `backend/src/queues/sync.queue.js`: Typed queue producers (`addSyncJob`, `addRecurringJob`, `getJobStatus`, `cancelJob`).
- `backend/src/workers/sync.worker.js`: Resilient BullMQ worker with concurrency limit, graceful shutdown, and provider error classification.

### 4.2. Database Models (`backend/prisma/schema.prisma`)
- `SyncSchedule`: Persists recurring cron-based or interval schedules per website and provider (`enabled`, `frequency`, `lastRunAt`, `nextRunAt`, `timezone`).
- `SyncCheckpoint`: Tracks incremental progress per website and provider (`lastSuccessfulDate`, `lastSuccessfulSyncAt`).
- Enhance `SyncJob`: Add `workspaceId`, `clientId`, `recordsFetched`, `recordsStored`, `provider`, `priority`.

### 4.3. Sync Orchestration (`backend/src/services/sync/`)
- `syncOrchestrator.service.js`: Central coordinator validating tenant access, acquiring locks, and creating `SyncJob` records before queueing.
- `syncLock.service.js`: Per-website/per-provider distributed lock (via Redis / MySQL fallback) preventing concurrent duplicate jobs.
- `syncScheduler.service.js`: Bootstrap recurring jobs in BullMQ / node-cron from `SyncSchedule` database records upon server start.
- `redisHealth.js`: Endpoint and service to inspect Redis connectivity, memory usage, and queue latency.

### 4.4. API Routes & Controller (`backend/src/modules/sync/`)
- `sync.routes.js` and `sync.controller.js`:
  - `POST /api/v1/workspaces/:workspaceId/websites/:websiteId/sync/trigger`: Trigger manual sync.
  - `GET /api/v1/workspaces/:workspaceId/websites/:websiteId/sync/status`: Latest sync status per provider.
  - `GET /api/v1/workspaces/:workspaceId/websites/:websiteId/sync/history`: Paginated sync history.
  - `POST /api/v1/workspaces/:workspaceId/sync/jobs/:jobId/retry`: Retry failed job.
  - `POST /api/v1/workspaces/:workspaceId/sync/jobs/:jobId/cancel`: Cancel active/pending job.
  - `GET /api/v1/workspaces/:workspaceId/websites/:websiteId/sync/schedules`: List website sync schedules.
  - `PUT /api/v1/workspaces/:workspaceId/websites/:websiteId/sync/schedules/:scheduleId`: Update schedule.
  - `GET /api/v1/sync/health`: Redis and queue operational health check.

### 4.5. Frontend Sync Management UI
- `frontend/src/features/sync/syncApi.js` (or extend `integrationsApi.js`): RTK Query endpoints for sync triggers, status, history, schedules.
- `frontend/src/features/sync/components/SyncManagementModal.jsx`: Trigger manual sync with custom date range or rolling window.
- `frontend/src/features/sync/components/SyncScheduleModal.jsx`: Configure automated daily sync frequency and enabled state.
- `frontend/src/features/sync/components/SyncStatusBadge.jsx`: Real-time status indicators (QUEUED, RUNNING, COMPLETED, FAILED).
- Update `WebsiteDetailPage.jsx`: Embed sync status cards, schedule controls, and history drawer.

---

## 5. Files to Create and Modify

| Type | Path | Purpose |
| :--- | :--- | :--- |
| **Create** | `docker-compose.yml` | Containerized Redis (Redis 7 Alpine) for local development |
| **Create** | `backend/src/utils/redisHealth.js` | Connection health check and queue diagnostics |
| **Create** | `backend/src/queues/queue.config.js` | BullMQ connection and default job options |
| **Create** | `backend/src/queues/sync.queue.js` | BullMQ Queue instance and helper methods |
| **Create** | `backend/src/workers/sync.worker.js` | BullMQ Worker processing sync jobs with retry & backoff |
| **Create** | `backend/src/services/sync/syncLock.service.js` | Distributed mutex preventing duplicate concurrent runs |
| **Create** | `backend/src/services/sync/syncOrchestrator.service.js` | Master synchronization coordinator |
| **Create** | `backend/src/services/sync/syncScheduler.service.js` | Recurring schedule runner surviving restarts |
| **Create** | `backend/src/modules/sync/sync.controller.js` | REST controller with tenant and RBAC guards |
| **Create** | `backend/src/modules/sync/sync.routes.js` | Express route definitions |
| **Modify** | `backend/prisma/schema.prisma` | Add `SyncSchedule`, `SyncCheckpoint`, and update `SyncJob` |
| **Modify** | `backend/src/app.js` | Mount sync routes `/api/v1` |
| **Modify** | `backend/src/server.js` | Initialize worker and scheduler on startup; graceful shutdown |
| **Modify** | `backend/src/config/redis.js` | Add ping and health check helpers |
| **Create** | `backend/tests/unit/sync.test.js` | Tests for queue, lock, backoff, and idempotency |
| **Create** | `frontend/src/features/sync/components/SyncScheduleModal.jsx` | Schedule configuration modal |
| **Modify** | `frontend/src/features/integrations/integrationsApi.js` | Add sync endpoints |
| **Modify** | `frontend/src/pages/websites/WebsiteDetailPage.jsx` | Add schedule settings and sync status controls |

---

## 6. Implementation Sequence

1. **Step 2:** Prepare Redis configuration, `docker-compose.yml`, and `redisHealth.js`.
2. **Step 3 & 4:** Create BullMQ queue and worker infrastructure (`sync.queue.js`, `sync.worker.js`).
3. **Step 5:** Prisma schema migration (`SyncSchedule`, `SyncCheckpoint`, `SyncJob`).
4. **Step 6, 7, 8, 9:** Implement `syncOrchestrator.service.js`, `syncLock.service.js`, and provider sync processors (GA4, GSC, Clarity).
5. **Step 10:** Implement `syncScheduler.service.js` for recurring daily syncs.
6. **Step 11:** Implement Sync REST API endpoints and routes.
7. **Step 12:** Frontend Sync Management UI integration.
8. **Step 13:** Automated unit & integration testing.
9. **Step 14 & 15:** Documentation update and final verification.
