# Model Context Protocol (MCP) Integration & Server Guide
## Missive Digital SEO Intelligence Platform

This document explains how external AI applications and developer agents (Claude Desktop, Antigravity, Cursor, Custom Agents) connect to the Missive SEO Intelligence Platform via the official Model Context Protocol (MCP) SDK for JavaScript.

---

## 1. Supported MCP Transports

The Missive MCP server supports two production transports:

| Transport | Communication Mode | Typical Use Case | Authentication |
| :--- | :--- | :--- | :--- |
| **STDIO Transport** | Standard Input / Output streams | Local AI clients (Claude Desktop, Cursor, Antigravity IDE) running on the same host | Process environment variables |
| **Streamable HTTP Transport** | HTTP POST + Server-Sent Events (SSE) | Remote AI agents and network services connecting across VPCs or internet | Bearer Token (`Authorization: Bearer mcp_live_...`) |

---

## 2. Available MCP Capabilities

### Available Tools (20 Registered Tools)

#### A. Google Analytics 4 (GA4) Tools
1. `get_ga4_summary`: Fetches aggregated sessions, active users, page views, engagement rate, bounce rate, and conversions for a specified date range.
2. `get_ga4_traffic_trend`: Returns daily session, user, and pageview trend time-series data.
3. `get_ga4_top_pages`: Retrieves top landing and viewed pages sorted by pageviews or sessions.
4. `get_ga4_device_breakdown`: Reports traffic distribution across desktop, mobile, and tablet.

#### B. Google Search Console (GSC) Tools
5. `get_gsc_performance`: Returns total impressions, clicks, average CTR, and average search position.
6. `get_gsc_top_queries`: Lists top search queries with click, impression, CTR, and position metrics.
7. `get_gsc_top_pages`: Returns top ranking URLs with search performance metrics.
8. `get_gsc_query_trend`: Daily query and click volume progression.

#### C. Microsoft Clarity UX Tools
9. `get_clarity_ux_insights`: Returns user frustration signals (dead clicks, rage clicks, quick backs, excessive scrolling, script errors).
10. `get_clarity_device_breakdown`: User experience metrics broken down by device type.

#### D. Deterministic SEO Analysis Engine Tools
11. `get_seo_findings`: Retrieves deterministic findings categorized by severity (`CRITICAL`, `WARNING`, `OPPORTUNITY`, `INFO`).
12. `get_critical_seo_issues`: Filters urgent issues requiring immediate intervention.
13. `get_traffic_drop_analysis`: Evaluates sudden or gradual organic traffic drops against historical baselines.
14. `get_quick_win_opportunities`: High-impression, position 4–20 keyword opportunities with high CTR improvement potential.

#### E. Comparison Tools
15. `compare_date_periods`: Computes delta and percentage change between two arbitrary date periods.
16. `compare_performance_to_baseline`: Compares current website metrics against established 30-day agency baselines.

#### F. Website & Platform Exploration Tools
17. `list_accessible_websites`: Lists all monitored websites accessible to the authenticated context.
18. `get_website_details`: Returns domain, client ownership, and integration connectivity status.
19. `get_website_status`: Verifies data freshness and latest sync completion timestamps.
20. `list_available_tools`: Returns complete tool capability catalog.

### Dynamic Resources (3 Templates)
- `seo://websites/{websiteId}/overview`: Snapshot of domain, active integrations, and health metrics.
- `seo://websites/{websiteId}/analytics`: Real-time compiled GA4 and GSC metrics for the last 28 days.
- `seo://websites/{websiteId}/findings`: Active deterministic findings with severity classifications.

### Guided Prompts (3 Workflows)
- `seo-audit-summary`: Guides the AI agent through a comprehensive website audit.
- `traffic-drop-investigation`: Investigates causes behind organic traffic declines.
- `keyword-opportunity-plan`: Generates a prioritized keyword optimization plan.

---

## 3. Client Configuration Examples

### 1. Claude Desktop (STDIO Transport)
Add to your Claude Desktop configuration file:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "missive-seo": {
      "command": "node",
      "args": [
        "/opt/missive-seo/backend/src/mcp/transports/stdio.transport.js"
      ],
      "env": {
        "DATABASE_URL": "mysql://missive_app:SECURE_PASSWORD@127.0.0.1:3306/missive_seo",
        "ENCRYPTION_KEY": "1f7c8b4e9a0d2f5e8b1c4a7d0e3f6a9b2c5e8a1d4f7b0e3c6a9d2f5e8b1c4a7d"
      }
    }
  }
}
```

### 2. Cursor IDE (STDIO Transport)
Add to `.cursor/mcp.json` in your workspace root:

```json
{
  "mcpServers": {
    "missive-seo": {
      "command": "node",
      "args": ["backend/src/mcp/transports/stdio.transport.js"],
      "env": {
        "DATABASE_URL": "mysql://missive_user:change_me_password@localhost:3306/missive_seo",
        "ENCRYPTION_KEY": "YOUR_64_HEX_CHAR_ENCRYPTION_KEY"
      }
    }
  }
}
```

### 3. Remote HTTP Transport (Claude / Custom AI Agent)
For remote agents connecting over HTTPS:

```bash
# Example invocation using curl:
curl -X POST https://seo.missivedigital.com/api/v1/mcp \
  -H "Authorization: Bearer mcp_live_e4b7a1c8f92d0e3b6a5f8c1d4e7a" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_seo_findings",
      "arguments": {
        "websiteId": "web_clx8912340001",
        "severity": "CRITICAL"
      }
    }
  }'
```

---

## 4. MCP Token Management & Access Control

1. Log in to the web platform as an **Admin** or **Super Admin**.
2. Navigate to **Workspace Settings > MCP Management**.
3. Generate a new token with optional expiration and scope restrictions.
4. Tokens are hashed using **SHA-256** in the database; plaintext tokens are revealed only once upon creation.
5. All tool executions are logged in the `MCPAuditLog` table, tracking:
   - Tool name
   - Parameters passed
   - Calling user or token ID
   - Execution duration
   - Success/Failure status

---

## 5. Troubleshooting MCP Connections

| Symptom | Cause | Remedy |
| :--- | :--- | :--- |
| **STDIO server exits immediately** | Missing `DATABASE_URL` or `ENCRYPTION_KEY` | Ensure `env` block in client config contains both variables. |
| **HTTP 401 Unauthorized** | Invalid or expired MCP token | Regenerate an active MCP token under Workspace Settings > MCP Management. |
| **`Website not found or unauthorized`** | Website belongs to a different workspace | Confirm the queried `websiteId` belongs to the workspace associated with the token. |
| **SSE connection drops after 60s** | Reverse proxy timeout | Verify Nginx `proxy_read_timeout 300s;` is set on the `/api/v1/mcp` location block. |
