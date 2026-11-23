// backend/src/mcp/server/mcp.server.js
// Master factory creating the Model Context Protocol (MCP) server.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MCP_SERVER_CONFIG } from './mcp.config.js';
import { registerAllTools } from '../tools/index.js';
import { registerAllResources } from '../resources/index.js';
import { registerAllPrompts } from '../prompts/index.js';

/**
 * Instantiate and configure the Missive SEO MCP Server with all tools, resources, and prompts.
 */
export function createMCPServer() {
  const server = new McpServer({
    name: MCP_SERVER_CONFIG.name,
    version: MCP_SERVER_CONFIG.version,
  });

  // Register all 20 tools across 6 groups
  registerAllTools(server);

  // Register resources
  registerAllResources(server);

  // Register prompts
  registerAllPrompts(server);

  return server;
}
