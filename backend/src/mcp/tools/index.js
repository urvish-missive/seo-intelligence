// backend/src/mcp/tools/index.js
// Aggregator registering all 20 MCP tools across 6 logical groups.

import { registerWebsiteTools } from './website.tools.js';
import { registerGA4Tools } from './ga4.tools.js';
import { registerGSCTools } from './gsc.tools.js';
import { registerClarityTools } from './clarity.tools.js';
import { registerSEOAnalysisTools } from './seo-analysis.tools.js';
import { registerComparisonTools } from './comparison.tools.js';

export function registerAllTools(server) {
  registerWebsiteTools(server);
  registerGA4Tools(server);
  registerGSCTools(server);
  registerClarityTools(server);
  registerSEOAnalysisTools(server);
  registerComparisonTools(server);
}
