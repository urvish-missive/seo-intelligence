// backend/src/mcp/services/mcp-response.service.js
// Standardized tool output envelope adhering to official MCP specifications.

export class MCPResponseService {
  /**
   * Format a successful tool result with structured metadata.
   */
  formatSuccess({ websiteId, provider, period = null, data, dataFreshness = null }) {
    const envelope = {
      success: true,
      websiteId,
      provider,
      period: period ? {
        startDate: period.startDate,
        endDate: period.endDate,
      } : undefined,
      data: this.sanitizeOutput(data),
      dataFreshness: dataFreshness || {
        retrievedAt: new Date().toISOString(),
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(envelope, null, 2),
        },
      ],
      structuredContent: envelope,
    };
  }

  /**
   * Format an error response without leaking stack traces or internal secrets.
   */
  formatError(error) {
    const errorObj = {
      success: false,
      error: error.message || 'An error occurred during tool execution',
      code: error.code || 'MCP_EXECUTION_ERROR',
      statusCode: error.status || 500,
    };

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorObj, null, 2),
        },
      ],
    };
  }

  /**
   * Deep sanitize to ensure no tokens, credentials or private fields leak out.
   */
  sanitizeOutput(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const BLOCKED_KEYS = new Set([
      'password',
      'passwordHash',
      'apiTokenEnc',
      'credentialsEnc',
      'refreshTokenEnc',
      'accessTokenEnc',
      'tokenHash',
      'clientSecret',
      'apiKey',
      'secret',
    ]);

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeOutput(item));
    }

    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      if (BLOCKED_KEYS.has(k)) continue;
      clean[k] = typeof v === 'object' && v !== null ? this.sanitizeOutput(v) : v;
    }
    return clean;
  }
}

export const mcpResponseService = new MCPResponseService();
