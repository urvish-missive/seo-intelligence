// frontend/src/features/clients/clientsApi.js
import { baseApi } from '../api/baseApi.js';

export const clientsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getClients: builder.query({
      query: ({ workspaceId, search, status, page, limit }) => ({
        url: `/workspaces/${workspaceId}/clients`,
        params: { search, status, page, limit },
      }),
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'Clients', id })),
              { type: 'Clients', id: 'LIST' },
            ]
          : [{ type: 'Clients', id: 'LIST' }],
    }),

    getClient: builder.query({
      query: ({ workspaceId, clientId }) => `/workspaces/${workspaceId}/clients/${clientId}`,
      providesTags: (result, error, { clientId }) => [{ type: 'Client', id: clientId }],
    }),

    createClient: builder.mutation({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/clients`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Clients', id: 'LIST' }, 'WorkspaceStats'],
    }),

    updateClient: builder.mutation({
      query: ({ workspaceId, clientId, ...body }) => ({
        url: `/workspaces/${workspaceId}/clients/${clientId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (result, error, { clientId }) => [
        { type: 'Client', id: clientId },
        { type: 'Clients', id: 'LIST' },
      ],
    }),

    archiveClient: builder.mutation({
      query: ({ workspaceId, clientId }) => ({
        url: `/workspaces/${workspaceId}/clients/${clientId}/archive`,
        method: 'PATCH',
      }),
      invalidatesTags: (result, error, { clientId }) => [
        { type: 'Client', id: clientId },
        { type: 'Clients', id: 'LIST' },
        'WorkspaceStats',
      ],
    }),

    deleteClient: builder.mutation({
      query: ({ workspaceId, clientId }) => ({
        url: `/workspaces/${workspaceId}/clients/${clientId}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Clients', id: 'LIST' }, 'WorkspaceStats'],
    }),

    assignClientMember: builder.mutation({
      query: ({ workspaceId, clientId, userId }) => ({
        url: `/workspaces/${workspaceId}/clients/${clientId}/members`,
        method: 'POST',
        body: { userId },
      }),
      invalidatesTags: (result, error, { clientId }) => [
        { type: 'Client', id: clientId },
        { type: 'Clients', id: 'LIST' },
      ],
    }),

    removeClientMember: builder.mutation({
      query: ({ workspaceId, clientId, userId }) => ({
        url: `/workspaces/${workspaceId}/clients/${clientId}/members/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { clientId }) => [
        { type: 'Client', id: clientId },
        { type: 'Clients', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetClientsQuery,
  useGetClientQuery,
  useCreateClientMutation,
  useUpdateClientMutation,
  useArchiveClientMutation,
  useDeleteClientMutation,
  useAssignClientMemberMutation,
  useRemoveClientMemberMutation,
} = clientsApi;
