# Phase 6 Implementation Plan: SEO & Web Analytics Dashboard Development

**Date:** November 20, 2026  
**Status:** In Progress (Steps 1 & 2 Completed)  
**Author:** Senior Full-Stack Software Architect & Data Visualization Specialist  
**Project:** Missive Digital SEO Intelligence Platform  

---

## 1. Executive Summary & Existing Data Inspection

In Phase 6, we design and build a multi-level analytics dashboard system for Missive Digital. The dashboard combines stored metrics from **Google Analytics 4**, **Google Search Console**, and **Microsoft Clarity**, all queried 100% offline from the local MySQL database.

### 1.1. Available Analytics Data
1. **Google Analytics 4:**
   - Daily performance: sessions, organic sessions, total users, new users, active users, engaged sessions, engagement rate, average engagement time, bounce rate, conversions, screen/page views.
   - Landing pages: page path, sessions, organic sessions, users, engagement rate, average time, bounce rate, conversions.
   - Traffic acquisition: source, medium, campaign, sessions, organic sessions, users, engaged sessions, conversions.
2. **Google Search Console:**
   - Search performance: clicks, impressions, aggregate CTR (`clicks / impressions * 100`), weighted average position (`sum(position * impressions) / sum(impressions)`).
   - Dimensions: queries, pages/URLs, countries, device categories (Desktop, Mobile, Tablet).
   - Opportunity indicators: high impression queries with lower CTR, high-ranking pages with click drops.
3. **Microsoft Clarity:**
   - Behavioral UX friction: rage clicks, dead clicks, quickbacks, excessive scrolling, client JavaScript script errors.
   - Engagement: average scroll depth, average active time on page, pages per session.
   - Dimensions: top pages, device categories, countries, and raw JSON import snapshots.
   - Clarity quota & freshness: daily call usage (`x/10`), last refresh timestamp, exact rolling window (1, 2, or 3 days).

### 1.2. Available Components & Libraries
- **Recharts (^2.15.0):** Verified installed in `frontend/package.json`.
- **Lucide Icons (^0.469.0):** Comprehensive icon set.
- **Tailwind CSS & Design Tokens:** Reusable button, card, badge, input classes.
- **RTK Query:** Integrated in `integrationsApi.js` with tag invalidation.

---

## 2. Dashboard Architecture & Hierarchy

```
Workspace
  │
  ├── 1. Agency Overview Dashboard (All Clients & Websites)
  │      - Multi-client health, total organic clicks, GA4 sessions, sync statuses
  │
  ├── 2. Client Overview Dashboard (/clients/:clientId/analytics)
  │      - Aggregated performance across all websites under a client
  │
  └── 3. Website Analytics Dashboard (/websites/:websiteId)
         ├── Tab 1: Cross-Platform Overview (GA4 + GSC + Clarity high-level KPI cards)
         ├── Tab 2: GA4 Deep-Dive (Traffic, Trends, Sources, Landing Pages, Tech)
         ├── Tab 3: GSC Deep-Dive (Search Trends, Top Queries, Top Pages, Opportunity Indicators)
         ├── Tab 4: Clarity Deep-Dive (UX Friction, Rage/Dead Clicks, Scroll Depth, Devices)
         ├── Tab 5: Background Sync & Queues (Phase 5 BullMQ management)
         └── Tab 6: Integration Settings (Connection configurations)
```

---

## 3. Period Comparison Engine

When the user selects a date range $[T_0, T_1]$ of length $N$ days:
- Preceding comparison window $[P_0, P_1]$ has $P_1 = T_0 - 1\text{ day}$ and $P_0 = P_1 - (N - 1)\text{ days}$.
- Percentage change:
  $$\Delta\% = \begin{cases} \frac{\text{Current} - \text{Previous}}{\text{Previous}} \times 100 & \text{if Previous} > 0 \\ \text{null} & \text{if Previous} = 0 \text{ and Current} > 0 \\ 0\% & \text{if Previous} = 0 \text{ and Current} = 0 \end{cases}$$
- Mathematical integrity:
  - Overall GSC CTR is strictly $\frac{\sum \text{Clicks}}{\sum \text{Impressions}} \times 100$.
  - GSC Position is weighted: $\frac{\sum (\text{Position} \times \text{Impressions})}{\sum \text{Impressions}}$.
  - Clarity metrics are displayed with their actual rolling window (1–3 days) and never mathematically added to 30-day Google aggregates.

---

## 4. Implementation Steps

1. **Step 3:** Build backend date comparison and period calculation utilities (`analyticsDate.utils.js`).
2. **Step 4, 5, 6, 7, 8:** Implement comprehensive analytics backend APIs (GA4 summary/trends/sources/landing pages, GSC summary/trends/queries/pages/devices/countries/opportunities, Clarity behavioral summary, Cross-platform website overview, Client overview, Agency overview).
3. **Step 9:** Build reusable frontend components:
   - `DateRangeFilter.jsx` (Today, Yesterday, Last 7d, Last 28d, Last 30d, Last 90d, Custom Range, Comparison Toggle).
   - `MetricKpiCard.jsx` (Current, Previous, Absolute change, Percentage change, Trend arrow).
   - `TrendLineChart.jsx` (Interactive Recharts line chart with comparison overlay).
   - `BarBreakdownChart.jsx` (Recharts horizontal bar chart for devices and channels).
   - `DataTableWithFilter.jsx` (Sorting, search, pagination).
4. **Step 10, 11, 12, 13:** Implement GA4, GSC, Clarity, and Cross-Platform dashboard views.
5. **Step 14:** Implement Multi-Website and Client overview views.
6. **Step 15 & 16:** Database query optimization and automated Jest test suite.
7. **Step 17:** Documentation and Phase 6 Completion Report.
