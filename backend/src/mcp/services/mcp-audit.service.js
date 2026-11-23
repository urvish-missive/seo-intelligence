// backend/src/mcp/services/mcp-audit.service.js
// Asynchronous audit logging into MySQL mcp_tool_execution_logs.

import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

export class MCPAuditService {
  /**
   * Record an MCP tool call execution.
   */
  static async logExecution({
    mcpClientId,
    toolName,
    inputParams = {},
    outputSummary = null,
    success = true,
    errorMessage = null,
    durationMs = 0,
    userId = null,
    websiteId = null,
  }) {
    try {
      // If no dedicated mcpClientId provided, lookup or create default workspace client
      let targetClientId = mcpClientId;

      if (!targetClientId) {
        return; // Skip if no client context available
      }

      await prisma.mCPToolExecutionLog.create({
        data: {
          mcpClientId: targetClientId,
          toolName,
          inputParams: inputParams || {},
          outputSummary: typeof outputSummary === 'string' ? outputSummary.slice(0, 500) : JSON.stringify(outputSummary).slice(0, 500),
          success,
          errorMessage,
          durationMs,
          userId,
          websiteId,
        },
      });
    } catch (err) {
      logger.warn('Failed to persist MCP execution log:', { error: err.message, toolName });
    }
  }
}
