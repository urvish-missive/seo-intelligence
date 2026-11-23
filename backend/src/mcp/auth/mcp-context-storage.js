// backend/src/mcp/auth/mcp-context-storage.js
// Asynchronous execution storage for authenticated MCP request contexts.

import { AsyncLocalStorage } from 'node:async_hooks';

export const mcpContextStorage = new AsyncLocalStorage();

/**
 * Helper to retrieve active authenticated user context during an MCP tool/resource/prompt execution.
 */
export function getMCPRequestContext() {
  const store = mcpContextStorage.getStore();
  if (!store) {
    // Fallback if running outside HTTP (e.g. CLI STDIO with env credentials)
    return {
      user: {
        id: process.env.MCP_USER_ID || 'stdio-user',
        email: process.env.MCP_USER_EMAIL || 'stdio@missive.local',
        role: process.env.MCP_USER_ROLE || 'seo_manager',
        permissions: [
          'workspace.view',
          'websites.view',
          'integrations.view',
          'seo.view',
          'seo.analyse',
          'ai.chat',
          'ai.analyse',
        ],
      },
      workspaceId: process.env.MCP_WORKSPACE_ID || null,
      mcpClientId: process.env.MCP_CLIENT_ID || null,
    };
  }
  return store;
}
