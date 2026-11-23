// backend/src/mcp/transports/stdio.transport.js
// Standard I/O transport launcher for desktop MCP clients and subprocess execution.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMCPServer } from '../server/mcp.server.js';

export async function startStdioServer() {
  const server = createMCPServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  process.stderr.write('Missive SEO MCP Server running via STDIO transport\n');
}

if (process.argv[1]?.endsWith('stdio.transport.js')) {
  startStdioServer().catch((err) => {
    process.stderr.write(`STDIO MCP Server failed: ${err.message}\n`);
    process.exit(1);
  });
}
