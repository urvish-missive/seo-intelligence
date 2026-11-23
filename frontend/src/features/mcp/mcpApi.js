// frontend/src/features/mcp/mcpApi.js
// RTK Query endpoints for Phase 9 Model Context Protocol (MCP) server management.

import { baseApi } from '../api/baseApi.js';

export const mcpApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMcpStatus: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/mcp/status`,
      providesTags: ['MCPStatus'],
    }),

    getMcpCatalog: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/mcp/catalog`,
      providesTags: ['MCPCatalog'],
    }),

    getMcpTokens: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/mcp/tokens`,
      providesTags: ['MCPTokens'],
    }),

    createMcpToken: builder.mutation({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/mcp/tokens`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MCPTokens', 'MCPStatus'],
    }),

    revokeMcpToken: builder.mutation({
      query: ({ workspaceId, tokenId }) => ({
        url: `/workspaces/${workspaceId}/mcp/tokens/${tokenId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['MCPTokens', 'MCPStatus'],
    }),

    getMcpLogs: builder.query({
      query: ({ workspaceId, limit = 50, offset = 0 }) =>
        `/workspaces/${workspaceId}/mcp/logs?limit=${limit}&offset=${offset}`,
      providesTags: ['MCPLogs'],
    }),
  }),
});

export const {
  useGetMcpStatusQuery,
  useGetMcpCatalogQuery,
  useGetMcpTokensQuery,
  useCreateMcpTokenMutation,
  useRevokeMcpTokenMutation,
  useGetMcpLogsQuery,
} = mcpApi;
