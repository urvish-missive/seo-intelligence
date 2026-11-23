// frontend/src/features/websites/websitesApi.js
import { baseApi } from '../api/baseApi.js';

export const websitesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWebsites: builder.query({
      query: ({ workspaceId, clientId, status, search }) => ({
        url: clientId
          ? `/workspaces/${workspaceId}/clients/${clientId}/websites`
          : `/workspaces/${workspaceId}/websites`,
        params: { status, search },
      }),
      providesTags: [{ type: 'Websites', id: 'LIST' }],
    }),

    getWebsite: builder.query({
      query: ({ workspaceId, websiteId }) => `/workspaces/${workspaceId}/websites/${websiteId}`,
      providesTags: (result, error, { websiteId }) => [{ type: 'Website', id: websiteId }],
    }),

    createWebsite: builder.mutation({
      query: ({ workspaceId, clientId, ...body }) => ({
        url: `/workspaces/${workspaceId}/clients/${clientId}/websites`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [
        { type: 'Websites', id: 'LIST' },
        { type: 'Client', id: 'LIST' },
        'WorkspaceStats',
      ],
    }),

    updateWebsite: builder.mutation({
      query: ({ workspaceId, websiteId, ...body }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (result, error, { websiteId }) => [
        { type: 'Website', id: websiteId },
        { type: 'Websites', id: 'LIST' },
      ],
    }),

    archiveWebsite: builder.mutation({
      query: ({ workspaceId, websiteId }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}/archive`,
        method: 'PATCH',
      }),
      invalidatesTags: (result, error, { websiteId }) => [
        { type: 'Website', id: websiteId },
        { type: 'Websites', id: 'LIST' },
        'WorkspaceStats',
      ],
    }),

    deleteWebsite: builder.mutation({
      query: ({ workspaceId, websiteId }) => ({
        url: `/workspaces/${workspaceId}/websites/${websiteId}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Websites', id: 'LIST' }, 'WorkspaceStats'],
    }),
  }),
});

export const {
  useGetWebsitesQuery,
  useGetWebsiteQuery,
  useCreateWebsiteMutation,
  useUpdateWebsiteMutation,
  useArchiveWebsiteMutation,
  useDeleteWebsiteMutation,
} = websitesApi;
