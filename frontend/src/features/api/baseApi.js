// frontend/src/features/api/baseApi.js
// RTK Query base API definition with automatic token refresh and tag invalidation.

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { setCredentials, clearCredentials } from '../auth/authSlice.js';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth?.accessToken;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

let refreshPromise = null;

const baseQueryWithReauth = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  const url = typeof args === 'string' ? args : args.url;
  const isAuthEndpoint =
    url?.includes('/auth/login') ||
    url?.includes('/auth/refresh') ||
    url?.includes('/auth/register');

  if (
    result.error &&
    (result.error.status === 401 || result.error.originalStatus === 401) &&
    !isAuthEndpoint
  ) {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          return await rawBaseQuery(
            { url: '/auth/refresh', method: 'POST' },
            api,
            extraOptions
          );
        } finally {
          refreshPromise = null;
        }
      })();
    }

    const refreshResult = await refreshPromise;
    if (refreshResult?.data?.data) {
      api.dispatch(setCredentials(refreshResult.data.data));
      // Retry initial request with new access token
      result = await rawBaseQuery(args, api, extraOptions);
    } else {
      api.dispatch(clearCredentials());
    }
  }

  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'Auth',
    'User',
    'Workspace',
    'WorkspaceStats',
    'Members',
    'Invitations',
    'Roles',
    'Permissions',
    'Clients',
    'Client',
    'Websites',
    'Website',
    'Health',
    'GoogleAccounts',
    'WebsiteIntegrations',
    'WebsiteAnalytics',
    'ClarityConnections',
    'ClaritySnapshots',
    'ClarityCsvImports',
    'SyncStatus',
    'SyncSchedules',
    'SyncJobs',
    'AIConversations',
    'AIConversation',
    'AIHealth',
    'AIConfig',
    'MCPStatus',
    'MCPCatalog',
    'MCPTokens',
    'MCPLogs',
    'Reports',
    'ReportSchedules',
    'ReportBranding',
  ],
  endpoints: () => ({}),
});
