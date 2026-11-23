# PHASE 7 IMPLEMENTATION PLAN & AUDIT REPORT
## SEO Analysis Engine and Opportunity Detection
**Missive Digital SEO Intelligence Platform**  
**Role:** Senior Full-Stack Software Architect, Node.js Engineer & SEO Algorithm Specialist  
**Status:** Audit Completed · Ready for Implementation  

---

## 1. Repository Audit & Available Data Matrix

### A. Locally Stored Data Providers (MySQL)
Our inspection of `backend/prisma/schema.prisma` and database models confirms the following actual storage tables:

| Provider | Model / Table | Dimensions Available | Metrics Available | Granularity |
|---|---|---|---|---|
| **GA4** | `GA4DailyMetric` (`ga4_daily_metrics`) | `websiteId`, `date` | `sessions`, `organicSessions`, `totalUsers`, `newUsers`, `activeUsers`, `engagedSessions`, `engagementRate`, `avgEngagementTimeSec`, `bounceRate`, `conversions`, `screenPageViews` | Daily total per site |
| **GA4** | `GA4LandingPageMetric` (`ga4_landing_page_metrics`) | `landingPage` (URL), `date` | `sessions`, `organicSessions`, `users`, `engagedSessions`, `engagementRate`, `avgEngagementTimeSec`, `conversions`, `bounceRate`, `screenPageViews` | Daily per page |
| **GA4** | `GA4TrafficSourceMetric` (`ga4_traffic_source_metrics`) | `source`, `medium`, `campaign`, `date` | `sessions`, `organicSessions`, `users`, `conversions`, `engagedSessions` | Daily per source/medium |
| **GA4** | `GA4DeviceMetric` / `GA4CountryMetric` | `deviceCategory`, `country`, `date` | `sessions`, `organicSessions`, `users`, `conversions` | Daily per device / country |
| **GSC** | `GSCDailyMetric` (`gsc_daily_metrics`) | `websiteId`, `date` | `clicks`, `impressions`, `ctr`, `avgPosition` | Daily total per site |
| **GSC** | `GSCQueryMetric` (`gsc_query_metrics`) | `query`, `country`, `device`, `date` | `clicks`, `impressions`, `ctr`, `avgPosition` | Daily per query |
| **GSC** | `GSCPageMetric` (`gsc_page_metrics`) | `page` (URL), `country`, `device`, `date` | `clicks`, `impressions`, `ctr`, `avgPosition` | Daily per page |
| **GSC** | `GSCDeviceMetric` / `GSCCountryMetric` | `device`, `country`, `date` | `clicks`, `impressions`, `ctr`, `avgPosition` | Daily per device / country |
| **Clarity** | `ClarityDailyMetric` (`clarity_daily_metrics`) | `websiteId`, `date` | `sessions`, `distinctUsers`, `botSessions`, `pagesPerSession`, `engagementRate`, `avgScrollDepth`, `avgTimeOnPageSec`, `rageClickCount`, `deadClickCount`, `excessiveScrollCount`, `quickbackClickCount`, `scriptErrorCount`, `errorClickCount` | Daily total per site |
| **Clarity** | `ClarityPageMetric` (`clarity_page_metrics`) | `page` (URL), `date` | `sessions`, `avgScrollDepth`, `avgTimeOnPageSec`, `rageClicks`, `deadClicks`, `quickBacks` | Daily per page |
| **Clarity** | `ClarityImportSnapshot` | `preset`, `dimensions`, `windowStart`, `windowEnd` | Full raw JSON response, row counts, API quota status | Snapshot metadata |

---

## 2. Capabilities Matrix: Immediate vs Future Data Collection

### A. Can Be Implemented Immediately (Phase 7 Scope)
1. **Traffic Drop Detection**:
   - Declines in organic clicks and search impressions from GSC.
   - Declines in total sessions, organic sessions, and users from GA4.
   - Specific landing pages and traffic sources driving the loss.
   - Volume-guarded thresholds (e.g. minimum 50 clicks or 100 sessions to avoid small sample false positives).
2. **Keyword Opportunity Detection**:
   - High impressions with low clicks ($CTR < \text{benchmark}$).
   - Striking distance queries: Ranking between positions 4.0 and 20.0 with meaningful impression volume.
   - Queries with increasing impressions but stagnant/declining clicks.
   - Queries with position drops on high-impression terms.
   - Queries gaining search clicks and impressions (momentum).
3. **Low CTR Analysis & Benchmarking**:
   - Curve-based CTR benchmarks by ranking position (Pos 1: ~30%, Pos 2: ~16%, Pos 3: ~11%, Pos 4-5: ~7%, Pos 6-10: ~4%, Pos 11-20: ~1.5%).
   - Statistically significant CTR underperformance detection.
4. **Ranking Movement Engine**:
   - Queries entering top 10 (previous pos > 10, current pos $\le$ 10).
   - Queries dropping out of top 10.
   - Significant gainers ($\Delta \ge +3$ ranks) and losers ($\Delta \le -3$ ranks).
   - Ranking tier transitions: 1–3, 4–10, 11–20, 21–50, 51+.
5. **Landing Page Performance Analysis**:
   - Pages gaining vs losing organic clicks and sessions.
   - Pages with high impressions but low click-through.
   - High-traffic pages with poor user engagement (bounce rate / engagement time).
6. **Content Performance Decay Signals**:
   - Multi-window sustained decline (comparing 28d vs preceding 28d, and preceding 56d).
   - Identified as a *performance decay signal* based on traffic patterns (not assuming age of content).
7. **Clarity Behavioral UX Analysis**:
   - Pages with elevated dead click rate ($> 5\%$) or rage clicks ($> 3\%$).
   - Quickback spikes (immediate bounces).
   - Low scroll depth ($< 40\%$) on key content pages.
   - Elevated client-side script errors.
8. **Deterministic Anomaly Detection**:
   - Daily 7-day Simple Moving Average (SMA) baseline with standard deviation ($Z$-score $\ge 2.0$) with absolute volume floors.

### B. Features Requiring Future / External Data (Out of Scope for Phase 7)
- Keyword search volume and keyword difficulty (requires Ahrefs/Semrush API).
- SERP layout analysis (requires SERP scraping or third-party SERP API).
- Content published / updated dates (requires CMS API or headless crawler).
- Algorithm update correlation (requires external Google Search update database).
- AI/LLM narrative generation (reserved for Phase 8 Ollama integration).

---

## 3. Database Schema Extensions (Prisma)

To support persistent findings, deterministic rule versioning, lifecycle tracking, and user configuration without polluting earlier models, we will introduce:

1. **`SEOAnalysisRun`**:
   - `id`, `workspaceId`, `clientId`, `websiteId`, `status` (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`), `analysisPeriodStart`, `analysisPeriodEnd`, `comparisonPeriodStart`, `comparisonPeriodEnd`, `rulesVersion`, `findingsCount`, `startedAt`, `completedAt`, `error`.
2. **`SEOFinding`**:
   - `id`, `workspaceId`, `clientId`, `websiteId`, `analysisRunId`, `fingerprint` (stable unique hash combining `websiteId + type + affectedTarget` to prevent duplicates), `type` (e.g. `TRAFFIC_DROP`, `KEYWORD_OPPORTUNITY`, `LOW_CTR`, `RANKING_DROP`, `CONTENT_DECAY`, `BEHAVIOUR_FRICTION`), `title`, `description`, `severity` (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFORMATIONAL`), `priority` (`P1`, `P2`, `P3`, `P4`), `confidence` (`HIGH`, `MEDIUM`, `LOW`), `affectedTarget` (URL or query), `currentValue`, `previousValue`, `changeValue`, `changePercentage`, `evidenceJson` (structured numbers, dates, samples), `suggestedAction`, `status` (`NEW`, `OPEN`, `IN_PROGRESS`, `RESOLVED`, `DISMISSED`, `REOPENED`), `detectedAt`, `resolvedAt`, `createdAt`, `updatedAt`.
3. **`SEOFindingHistory`**:
   - `id`, `findingId`, `previousStatus`, `newStatus`, `changedById`, `note`, `createdAt`.
4. **`SEOAnalysisSetting`**:
   - `id`, `websiteId`, `workspaceId`, `minClicksThreshold`, `minImpressionsThreshold`, `trafficDropWarningPct`, `trafficDropCriticalPct`, `ctrBenchmarkCurve`, `enabledEnginesJson`, `updatedAt`.

---

## 4. Modular Engine Architecture

```
backend/src/modules/seo-analysis/
├── engines/
│   ├── traffic-drop.engine.js        # GSC & GA4 clicks/sessions drop detection
│   ├── keyword-opportunity.engine.js # Striking distance, high imp low click, momentum
│   ├── ctr-analysis.engine.js        # Position-benchmarked CTR deficits
│   ├── ranking-movement.engine.js    # Top 10 entries/exits, gainers & losers
│   ├── landing-page.engine.js        # Page-level organic gains/losses & engagement
│   ├── content-decay.engine.js       # Sustained multi-window performance erosion
│   ├── behaviour-analysis.engine.js  # Clarity dead clicks, rage clicks, quickbacks
│   └── anomaly-detection.engine.js   # 7-day rolling SMA & standard deviation spikes
├── services/
│   ├── seo-analysis.service.js       # Orchestrator running all engines & persisting runs
│   ├── seo-finding.service.js        # Finding lifecycle, queries, status updates & history
│   └── seo-setting.service.js        # Threshold and configuration management
├── rules/
│   ├── analysis-thresholds.js        # Configurable defaults (drops, min volume)
│   └── ctr-benchmarks.js             # Position-based expected CTR curves
├── utils/
│   ├── statistical.utils.js          # Mean, std dev, z-score, percentage deltas
│   ├── confidence.utils.js           # Severity, priority & confidence matrix
│   └── fingerprint.utils.js          # Stable MD5/SHA256 fingerprinting for idempotency
├── queues/
│   └── seo-analysis.queue.js         # BullMQ queue producer (reuses Redis connection)
├── workers/
│   └── seo-analysis.worker.js        # BullMQ worker processor executing analysis runs
├── controllers/
│   └── seo-analysis.controller.js    # REST API controller with full RBAC
└── routes/
    └── seo-analysis.routes.js        # Express routes mounted on /api/v1/workspaces/:workspaceId/seo-analysis
```

---

## 5. Background Queue & Worker Integration

- Reuses existing Redis infrastructure via `getBullMQConnection()` in `backend/src/queues/queue.config.js`.
- Queue name: `missive-seo-analysis`.
- **Auto-Trigger Hook**: When `sync.worker.js` completes successfully for a website, it queues an incremental SEO analysis run.
- **Manual Trigger**: Via `POST /api/v1/workspaces/:workspaceId/seo-analysis/run/:websiteId`.

---

## 6. Frontend Architecture (React + Vite + RTK Query)

```
frontend/src/features/seo-analysis/
├── seoAnalysisApi.js                 # RTK Query endpoints for findings, runs, settings
└── components/
    ├── SEOAnalysisOverview.jsx       # Scorecards: Critical, High, Opportunities, Open
    ├── FindingsList.jsx              # Searchable, filterable table (by severity, type, status)
    ├── FindingDetailModal.jsx        # Deep-dive modal with structured evidence and action items
    ├── StatusChangeModal.jsx         # Status update with note and history tracking
    ├── AnalysisSettingsModal.jsx     # Threshold customization modal
    └── sections/
        ├── KeywordOpportunitiesTab.jsx
        ├── TrafficAlertsTab.jsx
        ├── ContentPerformanceTab.jsx
        └── BehaviourInsightsTab.jsx
```

Integrated as Tab in `WebsiteDetailPage.jsx` and surfaced in `DashboardPage.jsx`.

---

## 7. Execution Roadmap

1. Update `backend/prisma/schema.prisma` with `SEOAnalysisRun`, `SEOFinding`, `SEOFindingHistory`, `SEOAnalysisSetting`.
2. Generate Prisma client & apply database migration.
3. Build utilities: `statistical.utils.js`, `confidence.utils.js`, `fingerprint.utils.js`, `analysis-thresholds.js`, `ctr-benchmarks.js`.
4. Build independent analysis engines:
   - `traffic-drop.engine.js`
   - `keyword-opportunity.engine.js`
   - `ctr-analysis.engine.js`
   - `ranking-movement.engine.js`
   - `landing-page.engine.js`
   - `content-decay.engine.js`
   - `behaviour-analysis.engine.js`
   - `anomaly-detection.engine.js`
5. Build orchestration services: `seo-analysis.service.js`, `seo-finding.service.js`, `seo-setting.service.js`.
6. Implement BullMQ queue & worker: `seo-analysis.queue.js`, `seo-analysis.worker.js`.
7. Implement controller & routes with RBAC (`seo.view`, `seo.analyse`).
8. Implement frontend RTK Query API & UI components.
9. Write unit and integration tests covering all engines and lifecycle states.
10. Verify full test suite passing and produce Phase 7 Completion Report.
