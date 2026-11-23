// backend/src/mcp/server/mcp.config.js
// Configuration constants for Missive SEO Model Context Protocol (MCP) server.

export const MCP_SERVER_CONFIG = {
  name: 'missive-seo-intelligence',
  version: '1.0.0',
  description: 'Missive SEO Intelligence Platform official MCP server exposing GA4, GSC, Clarity, and deterministic SEO analysis engines.',
  defaultLimit: 50,
  maxLimit: 100,
  supportedTransports: ['STDIO', 'STREAMABLE_HTTP'],
};
