// frontend/src/features/auth/authApi.js
import { baseApi } from '../api/baseApi.js';
import { setCredentials, clearCredentials } from './authSlice.js';

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setCredentials(data.data));
        } catch {}
      },
      invalidatesTags: ['Auth', 'Workspace', 'Clients', 'Websites', 'Members'],
    }),

    register: builder.mutation({
      query: (userData) => ({
        url: '/auth/register',
        method: 'POST',
        body: userData,
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setCredentials(data.data));
        } catch {}
      },
      invalidatesTags: ['Auth', 'Workspace'],
    }),

    refresh: builder.mutation({
      query: () => ({
        url: '/auth/refresh',
        method: 'POST',
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setCredentials(data.data));
        } catch {
          dispatch(clearCredentials());
        }
      },
    }),

    logout: builder.mutation({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(clearCredentials());
        } catch {
          dispatch(clearCredentials());
        }
      },
    }),

    getMe: builder.query({
      query: (workspaceId) => ({
        url: '/auth/me',
        params: workspaceId ? { workspaceId } : undefined,
      }),
      providesTags: ['Auth'],
    }),

    changePassword: builder.mutation({
      query: (body) => ({
        url: '/auth/change-password',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useRefreshMutation,
  useLogoutMutation,
  useGetMeQuery,
  useChangePasswordMutation,
} = authApi;
