// frontend/src/features/analytics/analyticsApi.js
// RTK Query endpoints for the Analytics Dashboard.
// Connects to local MySQL database storage for GA4, GSC, and Clarity.
//
// The deep-dive endpoints return metrics as { current, previous, percentChange }.
// The transformResponse adapters below reshape them into the flat fields the
// dashboard views read (totalClicks, comparison.deltas.x.percentage, timeSeries,
// pagination.total, ...), so the views render real numbers.

import { baseApi } from '../api/baseApi.js';

function buildQs(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

const cur = (m) => (m && typeof m === 'object' ? m.current : m);
const prv = (m) => (m && typeof m === 'object' ? m.previous : undefined);
const delta = (m) => (m && typeof m === 'object' ? { ...m, percentage: m.percentChange ?? null } : null);

/** Map a response's data through fn, leaving errors/empty payloads untouched. */
const mapData = (fn) => (res) => (res && res.data ? { ...res, data: fn(res.data) } : res);

const adaptGSCSummary = mapData((d) => {
  const s = d.summary || {};
  return {
    ...d,
    summary: {
      totalClicks: cur(s.clicks),
      totalImpressions: cur(s.impressions),
      averageCtr: cur(s.ctr),
      averagePosition: cur(s.avgPosition),
      comparison: {
        totalClicks: prv(s.clicks),
        totalImpressions: prv(s.impressions),
        averageCtr: prv(s.ctr),
        averagePosition: prv(s.avgPosition),
        deltas: {
          clicks: delta(s.clicks),
          impressions: delta(s.impressions),
          ctr: delta(s.ctr),
          position: delta(s.avgPosition),
        },
      },
    },
    timeSeries: (d.trends || []).map((t) => ({
      ...t,
      ctr: Number(((t.ctr || 0) * 100).toFixed(2)),
      position: t.avgPosition,
    })),
  };
});

const adaptGA4Summary = mapData((d) => {
  const s = d.summary || {};
  return {
    ...d,
    summary: {
      totalUsers: cur(s.totalUsers),
      totalSessions: cur(s.sessions),
      organicSessions: cur(s.organicSessions),
      engagedSessions: cur(s.engagedSessions),
      engagementRate: cur(s.engagementRate),
      averageEngagementTime: cur(s.avgEngagementTime),
      bounceRate: cur(s.bounceRate),
      conversions: cur(s.conversions),
      screenPageViews: cur(s.screenPageViews),
      comparison: {
        totalUsers: prv(s.totalUsers),
        totalSessions: prv(s.sessions),
        organicSessions: prv(s.organicSessions),
        engagedSessions: prv(s.engagedSessions),
        engagementRate: prv(s.engagementRate),
        averageEngagementTime: prv(s.avgEngagementTime),
        bounceRate: prv(s.bounceRate),
        conversions: prv(s.conversions),
        deltas: {
          users: delta(s.totalUsers),
          sessions: delta(s.sessions),
          organicSessions: delta(s.organicSessions),
          engagedSessions: delta(s.engagedSessions),
          engagementRate: delta(s.engagementRate),
          averageEngagementTime: delta(s.avgEngagementTime),
          bounceRate: delta(s.bounceRate),
          conversions: delta(s.conversions),
        },
      },
    },
    timeSeries: d.trends || [],
  };
});

const withPagination = mapData((d) => ({ ...d, pagination: { total: d.total ?? 0, limit: d.limit, offset: d.offset } }));

const withPositions = (rows = []) =>
  rows.map((r) => ({ ...r, position: r.position ?? r.avgPosition ?? 0 }));

export const analyticsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Agency Overview: Multi-client & multi-website SEO performance.
    // Accepts a workspaceId string (legacy) or { workspaceId, startDate, endDate }.
    getAgencyOverview: builder.query({
      query: (arg) => {
        const { workspaceId, startDate, endDate } = typeof arg === 'string' ? { workspaceId: arg } : arg || {};
        return `/workspaces/${workspaceId}/analytics/agency-overview${buildQs({ startDate, endDate })}`;
      },
      providesTags: ['WebsiteAnalytics'],
    }),

    // Website Cross-Platform Overview
    getWebsiteAnalyticsOverview: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, compare }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/overview${buildQs({ startDate, endDate, compare })}`,
      providesTags: ['WebsiteAnalytics'],
    }),

    // Report Summary: everything in the downloadable report, as JSON
    getReportSummary: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/report-summary${buildQs({ startDate, endDate })}`,
      providesTags: ['WebsiteAnalytics'],
    }),

    // GA4 Summary Metrics & Trends
    getGA4Summary: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, compare }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/ga4/summary${buildQs({ startDate, endDate, compare })}`,
      transformResponse: adaptGA4Summary,
      providesTags: ['WebsiteAnalytics'],
    }),

    // GA4 Traffic Sources & Channels
    getGA4Sources: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, limit = 20 }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/ga4/sources${buildQs({ startDate, endDate, limit })}`,
      transformResponse: mapData((d) => ({
        ...d,
        sources: (d.sources || []).map((s) => ({
          ...s,
          channelGroup: s.channelGroup ?? s.channel,
          sourceMedium: s.sourceMedium ?? [s.source, s.medium].filter(Boolean).join(' / '),
        })),
      })),
      providesTags: ['WebsiteAnalytics'],
    }),

    // GA4 Top Landing Pages
    getGA4LandingPages: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, limit = 25, offset = 0, search }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/ga4/landing-pages${buildQs({ startDate, endDate, limit, offset, search })}`,
      transformResponse: (res) =>
        withPagination(
          mapData((d) => ({
            ...d,
            pages: (d.pages || []).map((p) => ({ ...p, pagePath: p.pagePath ?? p.landingPage })),
          }))(res)
        ),
      providesTags: ['WebsiteAnalytics'],
    }),

    // GSC Summary Metrics & Trends
    getGSCSummary: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, compare }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/gsc/summary${buildQs({ startDate, endDate, compare })}`,
      transformResponse: adaptGSCSummary,
      providesTags: ['WebsiteAnalytics'],
    }),

    // GSC Top Queries with filtering
    getGSCQueries: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, limit = 50, offset = 0, search, minClicks, minImpressions }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/gsc/queries${buildQs({
          startDate, endDate, limit, offset, search, minClicks, minImpressions,
        })}`,
      transformResponse: (res) =>
        withPagination(mapData((d) => ({ ...d, queries: withPositions(d.queries) }))(res)),
      providesTags: ['WebsiteAnalytics'],
    }),

    // GSC Top Pages
    getGSCPages: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, limit = 50, offset = 0, search }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/gsc/pages${buildQs({ startDate, endDate, limit, offset, search })}`,
      transformResponse: (res) =>
        withPagination(mapData((d) => ({ ...d, pages: withPositions(d.pages) }))(res)),
      providesTags: ['WebsiteAnalytics'],
    }),

    // GSC Dimension Breakdowns (device, country)
    getGSCBreakdown: builder.query({
      query: ({ workspaceId, websiteId, dimension = 'device', startDate, endDate }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/gsc/breakdown${buildQs({ dimension, startDate, endDate })}`,
      transformResponse: (res) => {
        if (!res || !Array.isArray(res.data)) return res;
        return {
          ...res,
          data: {
            breakdown: res.data.map((b) => ({
              ...b,
              ctr: b.impressions > 0 ? Number(((b.clicks / b.impressions) * 100).toFixed(2)) : 0,
              position: b.position ?? null,
            })),
          },
        };
      },
      providesTags: ['WebsiteAnalytics'],
    }),

    // GSC Search Opportunities (Low CTR & Striking Distance)
    getGSCOpportunities: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/gsc/opportunities${buildQs({ startDate, endDate })}`,
      transformResponse: mapData((d) => ({
        ...d,
        opportunities: {
          lowCtrHighImpression: withPositions(d.lowCtrOpportunities),
          strikingDistance: withPositions(d.strikingDistance),
        },
      })),
      providesTags: ['WebsiteAnalytics'],
    }),

    // Clarity Behavioral Summary (optional date range)
    getClaritySummary: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/clarity/summary${buildQs({ startDate, endDate })}`,
      providesTags: ['WebsiteAnalytics'],
    }),

    // Charts page: which metrics each source/segment offers
    getChartCatalogue: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/analytics/charts/catalogue`,
    }),

    // Charts page: month-by-month series for one source + metric
    getMonthlyChart: builder.query({
      query: ({ workspaceId, websiteId, source, metric, segment, segmentValue, startDate, endDate }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/charts/monthly${buildQs({
          source, metric, segment, segmentValue, startDate, endDate,
        })}`,
      providesTags: ['WebsiteAnalytics'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetAgencyOverviewQuery,
  useGetWebsiteAnalyticsOverviewQuery,
  useGetReportSummaryQuery,
  useGetGA4SummaryQuery,
  useGetGA4SourcesQuery,
  useGetGA4LandingPagesQuery,
  useGetGSCSummaryQuery,
  useGetGSCQueriesQuery,
  useGetGSCPagesQuery,
  useGetGSCBreakdownQuery,
  useGetGSCOpportunitiesQuery,
  useGetClaritySummaryQuery,
  useGetChartCatalogueQuery,
  useGetMonthlyChartQuery,
} = analyticsApi;
