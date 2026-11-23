// backend/src/mcp/resources/website.resources.js
// Read-only MCP resources for websites.

import { WebsiteService } from '../../modules/websites/website.service.js';
import { AnalyticsDataService } from '../../modules/analytics/analyticsData.service.js';
import { MCPUserContext } from '../auth/mcp-user-context.js';
import { getMCPRequestContext } from '../auth/mcp-context-storage.js';

const websiteService = new WebsiteService();
const analyticsDataService = new AnalyticsDataService();

export function registerWebsiteResources(server) {
  // Static resource: seo://websites
  server.resource(
    'all_websites',
    'seo://websites',
    async (uri) => {
      const { user, workspaceId } = getMCPRequestContext();
      MCPUserContext.enforcePermission(user, 'websites.view');

      const websites = await websiteService.listWebsites(workspaceId, user, {});
      const data = websites.map(w => ({
        websiteId: w.id,
        name: w.name,
        domain: w.domain,
        client: w.client ? { id: w.client.id, name: w.client.name } : null,
      }));

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ websites: data, count: data.length }, null, 2),
          },
        ],
      };
    }
  );
}
