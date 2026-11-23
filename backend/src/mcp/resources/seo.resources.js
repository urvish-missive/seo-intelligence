// backend/src/mcp/resources/seo.resources.js
// Read-only MCP resources for deterministic SEO findings.

export function registerSEOResources(server) {
  // Information resource regarding deterministic engines
  server.resource(
    'seo_engines_info',
    'seo://analysis/engines',
    async (uri) => {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              engines: [
                'traffic-drop',
                'keyword-opportunity',
                'ctr-analysis',
                'ranking-movement',
                'landing-page',
                'content-decay',
                'behaviour-analysis',
                'anomaly-detection',
              ],
              severityLevels: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
              statusOptions: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'IGNORED'],
            }, null, 2),
          },
        ],
      };
    }
  );
}
