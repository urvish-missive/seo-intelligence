// frontend/src/features/analytics/analyticsApi.js
// RTK Query endpoints for Phase 6 Analytics Dashboard.
// Connects to local MySQL database storage for GA4, GSC, and Clarity.

import { baseApi } from '../api/baseApi.js';

export const analyticsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Agency Overview: Multi-client & multi-website SEO performance
    getAgencyOverview: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/analytics/agency-overview`,
      providesTags: ['WebsiteAnalytics'],
    }),

    // Website Cross-Platform Overview
    getWebsiteAnalyticsOverview: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, compare }) => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (compare !== undefined) params.set('compare', String(compare));
        const qs = params.toString();
        return `/workspaces/${workspaceId}/websites/${websiteId}/analytics/overview${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['WebsiteAnalytics'],
    }),

    // GA4 Summary Metrics & Trends
    getGA4Summary: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, compare }) => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (compare !== undefined) params.set('compare', String(compare));
        const qs = params.toString();
        return `/workspaces/${workspaceId}/websites/${websiteId}/analytics/ga4/summary${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['WebsiteAnalytics'],
    }),

    // GA4 Traffic Sources & Channels
    getGA4Sources: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, limit = 20 }) => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (limit) params.set('limit', String(limit));
        const qs = params.toString();
        return `/workspaces/${workspaceId}/websites/${websiteId}/analytics/ga4/sources${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['WebsiteAnalytics'],
    }),

    // GA4 Top Landing Pages
    getGA4LandingPages: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, limit = 25, offset = 0, search }) => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (limit) params.set('limit', String(limit));
        if (offset) params.set('offset', String(offset));
        if (search) params.set('search', search);
        const qs = params.toString();
        return `/workspaces/${workspaceId}/websites/${websiteId}/analytics/ga4/landing-pages${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['WebsiteAnalytics'],
    }),

    // GSC Summary Metrics & Trends
    getGSCSummary: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, compare }) => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (compare !== undefined) params.set('compare', String(compare));
        const qs = params.toString();
        return `/workspaces/${workspaceId}/websites/${websiteId}/analytics/gsc/summary${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['WebsiteAnalytics'],
    }),

    // GSC Top Queries with filtering
    getGSCQueries: builder.query({
      query: ({
        workspaceId,
        websiteId,
        startDate,
        endDate,
        limit = 50,
        offset = 0,
        search,
        minClicks,
        minImpressions,
      }) => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (limit) params.set('limit', String(limit));
        if (offset) params.set('offset', String(offset));
        if (search) params.set('search', search);
        if (minClicks !== undefined && minClicks !== '') params.set('minClicks', String(minClicks));
        if (minImpressions !== undefined && minImpressions !== '')
          params.set('minImpressions', String(minImpressions));
        const qs = params.toString();
        return `/workspaces/${workspaceId}/websites/${websiteId}/analytics/gsc/queries${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['WebsiteAnalytics'],
    }),

    // GSC Top Pages
    getGSCPages: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, limit = 50, offset = 0, search }) => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (limit) params.set('limit', String(limit));
        if (offset) params.set('offset', String(offset));
        if (search) params.set('search', search);
        const qs = params.toString();
        return `/workspaces/${workspaceId}/websites/${websiteId}/analytics/gsc/pages${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['WebsiteAnalytics'],
    }),

    // GSC Dimension Breakdowns (device, country)
    getGSCBreakdown: builder.query({
      query: ({ workspaceId, websiteId, dimension = 'device', startDate, endDate }) => {
        const params = new URLSearchParams();
        params.set('dimension', dimension);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        const qs = params.toString();
        return `/workspaces/${workspaceId}/websites/${websiteId}/analytics/gsc/breakdown${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['WebsiteAnalytics'],
    }),

    // GSC Search Opportunities (Low CTR & Striking Distance)
    getGSCOpportunities: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate }) => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        const qs = params.toString();
        return `/workspaces/${workspaceId}/websites/${websiteId}/analytics/gsc/opportunities${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['WebsiteAnalytics'],
    }),

    // Clarity Behavioral Summary
    getClaritySummary: builder.query({
      query: ({ workspaceId, websiteId }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/clarity/summary`,
      providesTags: ['WebsiteAnalytics'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetAgencyOverviewQuery,
  useGetWebsiteAnalyticsOverviewQuery,
  useGetGA4SummaryQuery,
  useGetGA4SourcesQuery,
  useGetGA4LandingPagesQuery,
  useGetGSCSummaryQuery,
  useGetGSCQueriesQuery,
  useGetGSCPagesQuery,
  useGetGSCBreakdownQuery,
  useGetGSCOpportunitiesQuery,
  useGetClaritySummaryQuery,
} = analyticsApi;
