// frontend/src/features/seo-analysis/seoAnalysisApi.js
// RTK Query API slice for Phase 7 SEO Analysis Engine.

import { baseApi } from '../api/baseApi.js';

export const seoAnalysisApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // 1. Dashboard Overview Stats
    getSEOOverview: builder.query({
      query: ({ workspaceId, websiteId }) =>
        `/workspaces/${workspaceId}/seo-analysis/overview/${websiteId}`,
      providesTags: ['SEOFinding', 'SEOAnalysis'],
    }),

    // 2. Paginated Findings with Filter & Search
    getSEOFindings: builder.query({
      query: ({
        workspaceId,
        websiteId,
        type,
        severity,
        priority,
        status,
        search,
        limit = 50,
        offset = 0,
      }) => {
        const params = new URLSearchParams();
        if (type) params.set('type', type);
        if (severity) params.set('severity', severity);
        if (priority) params.set('priority', priority);
        if (status) params.set('status', status);
        if (search) params.set('search', search);
        if (limit) params.set('limit', String(limit));
        if (offset) params.set('offset', String(offset));
        const qs = params.toString();
        return `/workspaces/${workspaceId}/seo-analysis/findings/${websiteId}${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['SEOFinding'],
    }),

    // 3. Single Finding Details by ID
    getSEOFindingById: builder.query({
      query: ({ workspaceId, findingId }) =>
        `/workspaces/${workspaceId}/seo-analysis/finding-detail/${findingId}`,
      providesTags: (result, error, { findingId }) => [{ type: 'SEOFinding', id: findingId }],
    }),

    // 4. Opportunities Specialized Endpoint
    getSEOOpportunities: builder.query({
      query: ({ workspaceId, websiteId, limit = 50 }) =>
        `/workspaces/${workspaceId}/seo-analysis/opportunities/${websiteId}?limit=${limit}`,
      providesTags: ['SEOFinding'],
    }),

    // 5. Traffic Drops
    getSEOTrafficDrops: builder.query({
      query: ({ workspaceId, websiteId, limit = 50 }) =>
        `/workspaces/${workspaceId}/seo-analysis/traffic-drops/${websiteId}?limit=${limit}`,
      providesTags: ['SEOFinding'],
    }),

    // 6. Ranking Movements
    getSEORankingMovements: builder.query({
      query: ({ workspaceId, websiteId }) =>
        `/workspaces/${workspaceId}/seo-analysis/ranking-movements/${websiteId}`,
      providesTags: ['SEOFinding'],
    }),

    // 7. Content Decay
    getSEOContentDecay: builder.query({
      query: ({ workspaceId, websiteId, limit = 50 }) =>
        `/workspaces/${workspaceId}/seo-analysis/content-decay/${websiteId}?limit=${limit}`,
      providesTags: ['SEOFinding'],
    }),

    // 8. Behaviour Insights (Clarity)
    getSEOBehaviourInsights: builder.query({
      query: ({ workspaceId, websiteId, limit = 50 }) =>
        `/workspaces/${workspaceId}/seo-analysis/behaviour-insights/${websiteId}?limit=${limit}`,
      providesTags: ['SEOFinding'],
    }),

    // 9. Run Analysis (POST)
    runSEOAnalysis: builder.mutation({
      query: ({ workspaceId, websiteId, ...body }) => ({
        url: `/workspaces/${workspaceId}/seo-analysis/run/${websiteId}`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SEOFinding', 'SEOAnalysis'],
    }),

    // 10. Update Finding Status (PATCH)
    updateSEOFindingStatus: builder.mutation({
      query: ({ workspaceId, findingId, ...body }) => ({
        url: `/workspaces/${workspaceId}/seo-analysis/findings/${findingId}/status`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (result, error, { findingId }) => [
        'SEOFinding',
        { type: 'SEOFinding', id: findingId },
      ],
    }),

    // 11. Analysis Run History
    getSEOAnalysisHistory: builder.query({
      query: ({ workspaceId, websiteId }) =>
        `/workspaces/${workspaceId}/seo-analysis/history/${websiteId}`,
      providesTags: ['SEOAnalysis'],
    }),

    // 12. Get Settings
    getSEOAnalysisSettings: builder.query({
      query: ({ workspaceId, websiteId }) =>
        `/workspaces/${workspaceId}/seo-analysis/settings/${websiteId}`,
      providesTags: ['SEOSettings'],
    }),

    // 13. Update Settings (PUT)
    updateSEOAnalysisSettings: builder.mutation({
      query: ({ workspaceId, websiteId, ...body }) => ({
        url: `/workspaces/${workspaceId}/seo-analysis/settings/${websiteId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['SEOSettings'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetSEOOverviewQuery,
  useGetSEOFindingsQuery,
  useGetSEOFindingByIdQuery,
  useGetSEOOpportunitiesQuery,
  useGetSEOTrafficDropsQuery,
  useGetSEORankingMovementsQuery,
  useGetSEOContentDecayQuery,
  useGetSEOBehaviourInsightsQuery,
  useRunSEOAnalysisMutation,
  useUpdateSEOFindingStatusMutation,
  useGetSEOAnalysisHistoryQuery,
  useGetSEOAnalysisSettingsQuery,
  useUpdateSEOAnalysisSettingsMutation,
} = seoAnalysisApi;
