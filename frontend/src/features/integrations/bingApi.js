// frontend/src/features/integrations/bingApi.js
// RTK Query endpoints for the Bing Webmaster Tools integration.

import { baseApi } from '../api/baseApi.js';

const base = (workspaceId, websiteId) => `/workspaces/${workspaceId}/websites/${websiteId}/integrations/bing`;

export const bingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getBingStatus: builder.query({
      query: ({ workspaceId, websiteId }) => base(workspaceId, websiteId),
      providesTags: ['WebsiteIntegrations'],
    }),
    // POST so the API key is sent in the body, never in a URL
    listBingSites: builder.mutation({
      query: ({ workspaceId, websiteId, apiKey }) => ({
        url: `${base(workspaceId, websiteId)}/sites`,
        method: 'POST',
        body: { apiKey },
      }),
    }),
    connectBing: builder.mutation({
      query: ({ workspaceId, websiteId, apiKey, siteUrl }) => ({
        url: `${base(workspaceId, websiteId)}/connect`,
        method: 'POST',
        body: { apiKey, siteUrl },
      }),
      invalidatesTags: ['WebsiteIntegrations', 'Website', 'SyncStatus', 'SyncSchedules'],
    }),
    importBing: builder.mutation({
      query: ({ workspaceId, websiteId }) => ({
        url: `${base(workspaceId, websiteId)}/import`,
        method: 'POST',
      }),
      invalidatesTags: ['SyncStatus', 'SyncJobs'],
    }),
    disconnectBing: builder.mutation({
      query: ({ workspaceId, websiteId }) => ({
        url: base(workspaceId, websiteId),
        method: 'DELETE',
      }),
      invalidatesTags: ['WebsiteIntegrations', 'Website', 'SyncStatus', 'SyncSchedules'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetBingStatusQuery,
  useListBingSitesMutation,
  useConnectBingMutation,
  useImportBingMutation,
  useDisconnectBingMutation,
} = bingApi;
