// mcp-server/src/server.js
// Production MCP Server entry point importing from backend/src/mcp.

import { startStdioServer } from '../../backend/src/mcp/transports/stdio.transport.js';

startStdioServer().catch((err) => {
  process.stderr.write(`MCP server error: ${err.message}\n`);
  process.exit(1);
});
