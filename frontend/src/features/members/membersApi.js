// frontend/src/features/members/membersApi.js
import { baseApi } from '../api/baseApi.js';

export const membersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMembers: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/members`,
      providesTags: ['Members'],
    }),

    inviteMember: builder.mutation({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/invitations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Invitations'],
    }),

    getInvitations: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/invitations`,
      providesTags: ['Invitations'],
    }),

    resendInvitation: builder.mutation({
      query: ({ workspaceId, invitationId }) => ({
        url: `/workspaces/${workspaceId}/invitations/${invitationId}/resend`,
        method: 'POST',
      }),
      invalidatesTags: ['Invitations'],
    }),

    revokeInvitation: builder.mutation({
      query: ({ workspaceId, invitationId }) => ({
        url: `/workspaces/${workspaceId}/invitations/${invitationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Invitations'],
    }),

    acceptInvitation: builder.mutation({
      query: ({ token, ...body }) => ({
        url: `/invitations/${token}/accept`,
        method: 'POST',
        body,
      }),
    }),

    updateMember: builder.mutation({
      query: ({ workspaceId, memberId, ...body }) => ({
        url: `/workspaces/${workspaceId}/members/${memberId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Members'],
    }),

    removeMember: builder.mutation({
      query: ({ workspaceId, memberId }) => ({
        url: `/workspaces/${workspaceId}/members/${memberId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Members', 'WorkspaceStats'],
    }),
  }),
});

export const {
  useGetMembersQuery,
  useInviteMemberMutation,
  useGetInvitationsQuery,
  useResendInvitationMutation,
  useRevokeInvitationMutation,
  useAcceptInvitationMutation,
  useUpdateMemberMutation,
  useRemoveMemberMutation,
} = membersApi;
