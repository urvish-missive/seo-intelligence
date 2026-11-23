// frontend/src/features/roles/rolesApi.js
import { baseApi } from '../api/baseApi.js';

export const rolesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getRoles: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/roles`,
      providesTags: ['Roles'],
    }),

    getPermissions: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/permissions`,
      providesTags: ['Permissions'],
    }),

    createRole: builder.mutation({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/roles`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Roles'],
    }),

    updateRole: builder.mutation({
      query: ({ workspaceId, roleId, ...body }) => ({
        url: `/workspaces/${workspaceId}/roles/${roleId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Roles'],
    }),

    deleteRole: builder.mutation({
      query: ({ workspaceId, roleId }) => ({
        url: `/workspaces/${workspaceId}/roles/${roleId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Roles'],
    }),
  }),
});

export const {
  useGetRolesQuery,
  useGetPermissionsQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
} = rolesApi;
