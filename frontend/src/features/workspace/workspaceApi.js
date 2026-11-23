// frontend/src/features/workspace/workspaceApi.js
import { baseApi } from '../api/baseApi.js';
import { setActiveWorkspace } from '../auth/authSlice.js';

export const workspaceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWorkspaces: builder.query({
      query: () => '/workspaces',
      providesTags: ['Workspace'],
    }),

    getWorkspace: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}`,
      providesTags: (result, error, id) => [{ type: 'Workspace', id }],
    }),

    getWorkspaceStats: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/stats`,
      providesTags: (result, error, id) => [{ type: 'WorkspaceStats', id }],
    }),

    createWorkspace: builder.mutation({
      query: (body) => ({
        url: '/workspaces',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Workspace'],
    }),

    updateWorkspace: builder.mutation({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (result, error, { workspaceId }) => [
        { type: 'Workspace', id: workspaceId },
        'Workspace',
      ],
    }),

    switchWorkspace: builder.mutation({
      query: (workspaceId) => ({
        url: `/workspaces/${workspaceId}/switch`,
        method: 'POST',
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setActiveWorkspace(data.data));
        } catch {}
      },
      invalidatesTags: ['WorkspaceStats', 'Clients', 'Websites', 'Members'],
    }),
  }),
});

export const {
  useGetWorkspacesQuery,
  useGetWorkspaceQuery,
  useGetWorkspaceStatsQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useSwitchWorkspaceMutation,
} = workspaceApi;
