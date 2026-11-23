// backend/src/mcp/resources/index.js
// Aggregator for registering all MCP resources.

import { registerWebsiteResources } from './website.resources.js';
import { registerAnalyticsResources } from './analytics.resources.js';
import { registerSEOResources } from './seo.resources.js';

export function registerAllResources(server) {
  registerWebsiteResources(server);
  registerAnalyticsResources(server);
  registerSEOResources(server);
}
