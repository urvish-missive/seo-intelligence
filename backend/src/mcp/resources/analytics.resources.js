// backend/src/mcp/resources/analytics.resources.js
// Read-only MCP resources for GA4, GSC, and Clarity analytics summaries.

import { AnalyticsDataService } from '../../modules/analytics/analyticsData.service.js';
import { MCPUserContext } from '../auth/mcp-user-context.js';
import { getMCPRequestContext } from '../auth/mcp-context-storage.js';

const analyticsDataService = new AnalyticsDataService();

export function registerAnalyticsResources(server) {
  // Static platform health/analytics directory
  server.resource(
    'analytics_catalog',
    'seo://analytics/info',
    async (uri) => {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              availableDataProviders: ['GA4', 'GSC', 'CLARITY'],
              supportedMetrics: [
                'sessions',
                'organicSessions',
                'clicks',
                'impressions',
                'ctr',
                'averagePosition',
                'deadClicks',
                'rageClicks',
              ],
            }, null, 2),
          },
        ],
      };
    }
  );
}
