// ai-engine/src/orchestration/toolOrchestrator.js
// Orchestrates tool selection and execution for the AI assistant.
// The AI does NOT call tools directly — this layer controls all tool execution.

import { toolRegistry } from './toolRegistry.js';

/**
 * Orchestrate a tool call from the AI assistant.
 * Validates inputs, checks permissions, executes through backend service layer.
 *
 * @param {string} toolName - Name of tool to call
 * @param {object} params - Tool parameters
 * @param {object} context - Auth context (userId, workspaceId, websiteId)
 * @returns {Promise<any>} - Tool result
 */
export async function orchestrateToolCall(toolName, params, context) {
  const tool = toolRegistry[toolName];

  if (!tool) {
    throw new Error(`Tool "${toolName}" is not registered`);
  }

  // Validate input schema
  const validation = tool.inputSchema.safeParse(params);
  if (!validation.success) {
    throw new Error(`Invalid parameters for tool ${toolName}: ${validation.error.message}`);
  }

  // Execute tool (tool function handles auth check internally)
  return tool.execute(validation.data, context);
}

/**
 * List available tools for a given context.
 */
export function getAvailableTools(context) {
  return Object.entries(toolRegistry).map(([name, tool]) => ({
    name,
    description: tool.description,
    requiredParams: Object.keys(tool.inputSchema.shape || {}),
  }));
}
