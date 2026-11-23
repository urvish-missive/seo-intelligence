// frontend/src/features/ai/aiApi.js
// RTK Query endpoints for Phase 8 Local AI Assistant (Ollama + Qwen).

import { baseApi } from '../api/baseApi.js';

export const aiApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Check Ollama connectivity and model status
    getAiHealth: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/ai/health`,
      providesTags: ['AIHealth'],
    }),

    // List installed local Ollama models
    getAiModels: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/ai/models`,
      providesTags: ['AIHealth'],
    }),

    // Get workspace AI configuration
    getAiConfig: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/ai/config`,
      providesTags: ['AIConfig'],
    }),

    // Update workspace AI configuration
    updateAiConfig: builder.mutation({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/ai/config`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['AIConfig', 'AIHealth'],
    }),

    // List conversation threads in workspace
    getConversations: builder.query({
      query: ({ workspaceId, websiteId, limit = 50, offset = 0 }) => {
        const params = new URLSearchParams();
        if (websiteId) params.set('websiteId', websiteId);
        if (limit) params.set('limit', String(limit));
        if (offset) params.set('offset', String(offset));
        const qs = params.toString();
        return `/workspaces/${workspaceId}/ai/conversations${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['AIConversations'],
    }),

    // Get single conversation with full message history
    getConversation: builder.query({
      query: ({ workspaceId, conversationId }) =>
        `/workspaces/${workspaceId}/ai/conversations/${conversationId}`,
      providesTags: (result, error, { conversationId }) => [
        { type: 'AIConversation', id: conversationId },
      ],
    }),

    // Start a new conversation thread
    createConversation: builder.mutation({
      query: ({ workspaceId, websiteId, title }) => ({
        url: `/workspaces/${workspaceId}/ai/conversations`,
        method: 'POST',
        body: { websiteId, title },
      }),
      invalidatesTags: ['AIConversations'],
    }),

    // Delete a conversation thread
    deleteConversation: builder.mutation({
      query: ({ workspaceId, conversationId }) => ({
        url: `/workspaces/${workspaceId}/ai/conversations/${conversationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['AIConversations'],
    }),

    // Send a message and await standard JSON response
    sendMessage: builder.mutation({
      query: ({ workspaceId, conversationId, message, websiteId, model, temperature }) => ({
        url: `/workspaces/${workspaceId}/ai/conversations/${conversationId}/messages`,
        method: 'POST',
        body: { message, websiteId, model, temperature },
      }),
      invalidatesTags: (result, error, { conversationId }) => [
        { type: 'AIConversation', id: conversationId },
        'AIConversations',
      ],
    }),

    // Trigger one-click executive analysis
    generateAnalysis: builder.mutation({
      query: ({ workspaceId, websiteId, analysisType }) => ({
        url: `/workspaces/${workspaceId}/ai/websites/${websiteId}/analyse`,
        method: 'POST',
        body: { analysisType },
      }),
      invalidatesTags: ['WebsiteAnalytics', 'AIConversations'],
    }),
  }),
});

export const {
  useGetAiHealthQuery,
  useGetAiModelsQuery,
  useGetAiConfigQuery,
  useUpdateAiConfigMutation,
  useGetConversationsQuery,
  useGetConversationQuery,
  useCreateConversationMutation,
  useDeleteConversationMutation,
  useSendMessageMutation,
  useGenerateAnalysisMutation,
} = aiApi;
