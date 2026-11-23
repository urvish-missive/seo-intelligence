// frontend/src/features/integrations/integrationsApi.js
// RTK Query endpoints for Google, Microsoft Clarity, property discovery, website binding, and analytics data.

import { baseApi } from '../api/baseApi.js';

export const integrationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Google Auth URL
    getGoogleAuthUrl: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/integrations/google/auth-url`,
    }),

    // Workspace Google Accounts
    getGoogleAccounts: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/integrations/google/accounts`,
      providesTags: ['GoogleAccounts'],
    }),

    disconnectGoogleAccount: builder.mutation({
      query: ({ workspaceId, accountId }) => ({
        url: `/workspaces/${workspaceId}/integrations/google/accounts/${accountId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['GoogleAccounts', 'WebsiteIntegrations'],
    }),

    // Discovery
    getGA4Properties: builder.query({
      query: ({ workspaceId, accountId }) =>
        `/workspaces/${workspaceId}/integrations/google/accounts/${accountId}/ga4-properties`,
    }),

    getGSCSites: builder.query({
      query: ({ workspaceId, accountId }) =>
        `/workspaces/${workspaceId}/integrations/google/accounts/${accountId}/gsc-sites`,
    }),

    // Website Integrations (Shared GA4, GSC, Clarity Slots)
    getWebsiteIntegrations: builder.query({
      query: ({ workspaceId, websiteId }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/integrations`,
      providesTags: ['WebsiteIntegrations'],
    }),

    connectWebsiteProperty: builder.mutation({
      query: ({ workspaceId, websiteId, ...body }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/integrations/connect`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['WebsiteIntegrations', 'WebsiteAnalytics'],
    }),

    disconnectWebsiteProperty: builder.mutation({
      query: ({ workspaceId, websiteId, integrationType }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/integrations/disconnect`,
        method: 'POST',
        body: { integrationType },
      }),
      invalidatesTags: ['WebsiteIntegrations', 'WebsiteAnalytics'],
    }),

    triggerManualSync: builder.mutation({
      query: ({ workspaceId, websiteId, ...body }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/integrations/sync`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['WebsiteIntegrations', 'WebsiteAnalytics'],
    }),

    // ─── Microsoft Clarity Endpoints ─────────────────────────────────────
    getClarityConnections: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/integrations/clarity`,
      providesTags: ['ClarityConnections'],
    }),

    connectClarityProject: builder.mutation({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/integrations/clarity`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['ClarityConnections', 'WebsiteIntegrations'],
    }),

    replaceClarityToken: builder.mutation({
      query: ({ workspaceId, connectionId, ...body }) => ({
        url: `/workspaces/${workspaceId}/integrations/clarity/${connectionId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['ClarityConnections', 'WebsiteIntegrations'],
    }),

    disconnectClarityProject: builder.mutation({
      query: ({ workspaceId, connectionId }) => ({
        url: `/workspaces/${workspaceId}/integrations/clarity/${connectionId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['ClarityConnections', 'WebsiteIntegrations'],
    }),

    mapWebsiteToClarity: builder.mutation({
      query: ({ workspaceId, websiteId, ...body }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/integrations/clarity`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['WebsiteIntegrations', 'ClaritySnapshots', 'WebsiteAnalytics'],
    }),

    unmapWebsiteFromClarity: builder.mutation({
      query: ({ workspaceId, websiteId }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/integrations/clarity`,
        method: 'DELETE',
      }),
      invalidatesTags: ['WebsiteIntegrations', 'ClaritySnapshots', 'WebsiteAnalytics'],
    }),

    triggerClarityImport: builder.mutation({
      query: ({ workspaceId, websiteId, ...body }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/clarity/import`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['ClaritySnapshots', 'WebsiteIntegrations', 'WebsiteAnalytics', 'ClarityConnections'],
    }),

    getClaritySnapshots: builder.query({
      query: ({ workspaceId, websiteId, limit, offset }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/clarity/snapshots`,
        params: { limit, offset },
      }),
      providesTags: ['ClaritySnapshots'],
    }),

    getClaritySnapshotById: builder.query({
      query: ({ workspaceId, websiteId, snapshotId }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/clarity/snapshots/${snapshotId}`,
    }),

    getClarityOverview: builder.query({
      query: ({ workspaceId, websiteId }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/analytics/clarity`,
      providesTags: ['ClaritySnapshots', 'WebsiteAnalytics'],
    }),

    // ─── Local Stored Metrics (Offline) ──────────────────────────────────
    getWebsiteAnalyticsOverview: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/analytics/overview`,
        params: { startDate, endDate },
      }),
      providesTags: ['WebsiteAnalytics'],
    }),

    getWebsiteTopQueries: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, limit, offset }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/analytics/queries`,
        params: { startDate, endDate, limit, offset },
      }),
      providesTags: ['WebsiteAnalytics'],
    }),

    getWebsiteTopPages: builder.query({
      query: ({ workspaceId, websiteId, startDate, endDate, limit, offset }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/analytics/pages`,
        params: { startDate, endDate, limit, offset },
      }),
      providesTags: ['WebsiteAnalytics'],
    }),

    getWebsiteSyncHistory: builder.query({
      query: ({ workspaceId, websiteId, limit }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/analytics/sync-history`,
        params: { limit },
      }),
      providesTags: ['WebsiteIntegrations'],
    }),

    // ─── Background Sync Orchestration (Phase 5) ────────────────────────
    triggerBackgroundSync: builder.mutation({
      query: ({ workspaceId, websiteId, ...body }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/sync/trigger`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SyncStatus', 'SyncJobs', 'WebsiteAnalytics', 'WebsiteIntegrations'],
    }),

    getWebsiteBackgroundSyncStatus: builder.query({
      query: ({ workspaceId, websiteId }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/sync/status`,
      providesTags: ['SyncStatus'],
    }),

    getWebsiteBackgroundSyncHistory: builder.query({
      query: ({ workspaceId, websiteId, limit = 20, offset = 0, provider }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/sync/history`,
        params: { limit, offset, provider },
      }),
      providesTags: ['SyncJobs'],
    }),

    retryBackgroundSyncJob: builder.mutation({
      query: ({ workspaceId, jobId }) => ({
        url: `/workspaces/${workspaceId}/sync/jobs/${jobId}/retry`,
        method: 'POST',
      }),
      invalidatesTags: ['SyncJobs', 'SyncStatus'],
    }),

    cancelBackgroundSyncJob: builder.mutation({
      query: ({ workspaceId, jobId }) => ({
        url: `/workspaces/${workspaceId}/sync/jobs/${jobId}/cancel`,
        method: 'POST',
      }),
      invalidatesTags: ['SyncJobs', 'SyncStatus'],
    }),

    getWebsiteSyncSchedules: builder.query({
      query: ({ workspaceId, websiteId }) =>
        `/workspaces/${workspaceId}/websites/${websiteId}/sync/schedules`,
      providesTags: ['SyncSchedules'],
    }),

    updateWebsiteSyncSchedule: builder.mutation({
      query: ({ workspaceId, websiteId, provider, ...body }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/sync/schedules/${provider}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['SyncSchedules', 'SyncStatus'],
    }),

    getSyncHealth: builder.query({
      query: () => '/sync/health',
    }),
  }),
});

export const {
  useGetGoogleAuthUrlQuery,
  useLazyGetGoogleAuthUrlQuery,
  useGetGoogleAccountsQuery,
  useDisconnectGoogleAccountMutation,
  useGetGA4PropertiesQuery,
  useLazyGetGA4PropertiesQuery,
  useGetGSCSitesQuery,
  useLazyGetGSCSitesQuery,
  useGetWebsiteIntegrationsQuery,
  useConnectWebsitePropertyMutation,
  useDisconnectWebsitePropertyMutation,
  useTriggerManualSyncMutation,
  // Clarity Hooks
  useGetClarityConnectionsQuery,
  useConnectClarityProjectMutation,
  useReplaceClarityTokenMutation,
  useDisconnectClarityProjectMutation,
  useMapWebsiteToClarityMutation,
  useUnmapWebsiteFromClarityMutation,
  useTriggerClarityImportMutation,
  useGetClaritySnapshotsQuery,
  useGetClaritySnapshotByIdQuery,
  useGetClarityOverviewQuery,
  // Analytics
  useGetWebsiteAnalyticsOverviewQuery,
  useGetWebsiteTopQueriesQuery,
  useGetWebsiteTopPagesQuery,
  useGetWebsiteSyncHistoryQuery,
  // Background Sync (Phase 5)
  useTriggerBackgroundSyncMutation,
  useGetWebsiteBackgroundSyncStatusQuery,
  useGetWebsiteBackgroundSyncHistoryQuery,
  useRetryBackgroundSyncJobMutation,
  useCancelBackgroundSyncJobMutation,
  useGetWebsiteSyncSchedulesQuery,
  useUpdateWebsiteSyncScheduleMutation,
  useGetSyncHealthQuery,
} = integrationsApi;
