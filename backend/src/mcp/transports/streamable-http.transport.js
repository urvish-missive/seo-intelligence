// backend/src/mcp/transports/streamable-http.transport.js
// Express Router implementing the official Streamable HTTP MCP transport.

import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMCPServer } from '../server/mcp.server.js';
import { mcpAuthMiddleware } from '../auth/mcp-auth.middleware.js';
import logger from '../../utils/logger.js';

const router = Router();

// Create stateless Streamable HTTP transport
const mcpServer = createMCPServer();
const streamableTransport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // Stateless mode
});

// Connect server to transport once
await mcpServer.connect(streamableTransport);

// Protect all MCP endpoint requests with authentication
router.use(mcpAuthMiddleware);

// Handle JSON-RPC and SSE stream requests
router.post('/', async (req, res, next) => {
  try {
    await streamableTransport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error('Streamable HTTP POST error:', { error: err.message });
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    await streamableTransport.handleRequest(req, res);
  } catch (err) {
    logger.error('Streamable HTTP GET error:', { error: err.message });
    next(err);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    await streamableTransport.handleRequest(req, res);
  } catch (err) {
    logger.error('Streamable HTTP DELETE error:', { error: err.message });
    next(err);
  }
});

export default router;
