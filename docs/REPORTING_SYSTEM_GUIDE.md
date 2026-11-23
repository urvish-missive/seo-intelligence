# Missive SEO Intelligence Platform — Reporting & Export System Guide

## Overview

The **Reporting & Export System** (Phase 10) allows digital agencies to generate, customize, schedule, and download professional client-ready SEO performance reports in **PDF** and **Excel (XLSX)** formats.

All report data is compiled strictly from verified local snapshots across:
- **Google Analytics 4 (GA4)**: Sessions, active users, engagement rate, bounce rate, channels, top landing pages.
- **Google Search Console (GSC)**: Search clicks, impressions, CTR, average position, queries, rankings.
- **Microsoft Clarity**: Aggregate visitor friction metrics (dead clicks, rage clicks, quickbacks, script errors).
- **Deterministic SEO Analysis Engine**: Active findings, striking-distance keyword opportunities (positions 4–20), content decay, and traffic-drop highlights.

---

## 1. Supported Report Templates

| Template ID | Report Name | Description | Default Cadence | Formats |
| :--- | :--- | :--- | :--- | :--- |
| `MONTHLY_SEO` | **Monthly SEO Performance Report** | Complete multi-platform review covering GA4, GSC, Clarity, and deterministic SEO findings. | Monthly | PDF, Excel, Both |
| `WEBSITE_PERFORMANCE` | **Website Performance & Traffic Report** | In-depth traffic analysis by acquisition source, channel group, devices, and landing pages. | Monthly | PDF, Excel, Both |
| `KEYWORD_OPPORTUNITY` | **Keyword Opportunity & Rankings Report** | Highlights queries ranking between positions 4 and 20 with high impression volume and metadata CTR optimization potential. | Weekly | PDF, Excel, Both |
| `TRAFFIC_DROP` | **Traffic Drop Investigation Report** | Diagnostic root-cause audit comparing two time windows to isolate declining landing pages, channels, and search terms. | Custom | PDF, Excel, Both |
| `CLARITY_BEHAVIOUR` | **Clarity User Behaviour & UX Report** | High-friction pages, rage clicks, dead clicks, quickbacks, and frontend JavaScript errors. | Monthly | PDF, Excel, Both |
| `CUSTOM` | **Custom Tailored SEO Report** | Flexible custom report with user-selected metrics, sections, and date ranges. | Custom | PDF, Excel, Both |

---

## 2. Document & Export Generators

### A. PDF Audit Generator (`pdfkit`)
- **Library**: `pdfkit` (pure Node.js, MIT license).
- **Branding**: Configurable agency header banner, primary and secondary brand colors, contact email, website, and custom footer.
- **Layout**:
  - Cover page with agency and client metadata, target domain, and date range.
  - Executive summary with optional local Ollama narrative or deterministic rules.
  - KPI grid with period-over-period percentage changes (`+14.5% vs prior`).
  - Structured tables: top search queries, top landing pages, striking distance opportunities, SEO audit findings, Clarity friction cards.
  - Dynamic running headers and footers with page numbering (`Page X of Y`).
  - Data freshness disclosure noting last synchronization timestamps.

### B. Excel Workbook Generator (`exceljs`)
- **Library**: `exceljs` (pure JavaScript, MIT license).
- **Worksheets Created**:
  1. `Overview`: High-level metrics, domain info, agency branding, and data integrity indicators.
  2. `GA4 Traffic`: Acquisition sources, channels, sessions, users, engagement, and bounce rates.
  3. `GSC Queries`: Search query clicks, impressions, CTR, and average positions.
  4. `Keyword Opportunities`: Pos 4–20 striking distance keywords with strategic recommendations.
  5. `Landing Pages`: URL performance breakdown.
  6. `SEO Findings`: Open technical, content, and indexation issues with severity and target.
  7. `Clarity UX`: Behavioral friction metrics.
- **Spreadsheet Security (CWE-1236 Defense)**: All cell values are sanitized against **Excel Formula Injection**. Any string beginning with `=`, `+`, `-`, `@`, `\t`, `\r` is automatically escaped with a leading single quote (`'`), ensuring spreadsheet software renders the value strictly as text.
- **Formatting**: Dark styled headers (`#1E293B`), frozen panes, auto-filters, and auto-formatted numbers (`#,##0`, `0.0%`, `0.0`).

---

## 3. Storage & Secure Download

- **Directory**: `./storage/reports` (configurable via `REPORTS_DIR` in `.env`).
- **Isolation**: Reports are stored with random UUID keys (`report-<id>.pdf`, `report-<id>.xlsx`).
- **Security**: No static web server exposure. File downloads require valid JWT authentication, active workspace membership, and website/client assignment scoping. Path traversal attempts are blocked via strict basename normalization.

---

## 4. Background Job Scheduling (BullMQ + Redis)

- **Queue**: `missive-seo-reports`
- **Cadence**: Authorised users can schedule reports to run:
  - **Weekly**: Specific day of week (e.g. every Monday at 09:00).
  - **Monthly**: Specific day of month (e.g. 1st of every month at 09:00).
  - **Quarterly**: 1st of January, April, July, October.
- **Worker**: Processes report generation asynchronously, writes files, persists section content in database, logs start/completion times in `ReportGenerationLog`, and updates schedule history.
- **Controls**: Schedules can be paused, resumed, or deleted at any time from the UI or API.

---

## 5. Agency Branding

Workspace administrators can configure agency branding stamped across all generated documents:
- Agency Name (e.g. `Acme Digital Agency`)
- Brand Primary Color (`#4f46e5`)
- Brand Secondary Color (`#0f172a`)
- Agency Website (`https://acme.agency`)
- Contact Email (`reports@acme.agency`)
- Running Footer Text (`Confidential Performance Intelligence`)

---

## 6. API Reference

All endpoints are mounted at `/api/v1/workspaces/:workspaceId/reports` and protected by JWT auth and RBAC:

- `GET /templates` — List available report templates (`reports.view`)
- `POST /preview` — Preview aggregated report metrics (`reports.view`)
- `POST /` — Generate new report asynchronously (`reports.create`)
- `GET /` — List reports archive (`reports.view`)
- `GET /:reportId` — Get single report details and sections (`reports.view`)
- `DELETE /:reportId` — Delete report and remove files from disk (`reports.create`)
- `GET /:reportId/download?format=PDF|EXCEL` — Stream authenticated report download (`reports.export`)
- `GET /schedules/all` — List recurring report schedules (`reports.view`)
- `POST /schedules` — Create recurring report schedule (`reports.schedule`)
- `PATCH /schedules/:scheduleId/toggle` — Pause / resume recurring schedule (`reports.schedule`)
- `DELETE /schedules/:scheduleId` — Delete report schedule (`reports.schedule`)
- `GET /branding/settings` — Get agency branding settings (`reports.view`)
- `PUT /branding/settings` — Update agency branding settings (`reports.schedule`)
