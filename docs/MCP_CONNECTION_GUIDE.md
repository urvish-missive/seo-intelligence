# Missive SEO Intelligence Platform — MCP Server Connection Guide

## Overview

The **Missive SEO Model Context Protocol (MCP) Server** exposes the platform's multi-tenant analytics, rankings, and deterministic SEO intelligence to compatible AI clients (including Claude Desktop, Cursor, and custom agentic frameworks).

Built using the official Model Context Protocol JavaScript SDK (`@modelcontextprotocol/sdk`), the server provides:
- **20 Read-Only Tools** spanning Website Management, GA4, Google Search Console, Microsoft Clarity, SEO Anomaly Findings, and Multi-Website Comparisons.
- **3 Dynamic Resources** (`seo://websites`, `seo://analytics/info`, `seo://analysis/engines`).
- **5 Standardized Prompts** for guided multi-step agency investigations.
- **Dual Transport Support**: Subprocess `STDIO` for local desktop tools and `Streamable HTTP` for remote cloud agents.
- **Tenant Isolation & RBAC**: Every call is securely scoped to authorized workspaces and assigned client websites.

---

## 1. Quick Connection Reference

| Parameter | STDIO Transport (Local) | Streamable HTTP Transport (Remote) |
| :--- | :--- | :--- |
| **Primary Use Case** | Claude Desktop, local dev agents | Cursor, remote AI agents, cloud orchestrators |
| **Executable / URL** | `node mcp-server/src/server.js` | `http://localhost:5000/api/v1/mcp` |
| **Authentication** | Environment variables or Token header | `Authorization: Bearer <mcp_token_or_jwt>` |
| **Transport Type** | Standard I/O (JSON-RPC) | Server-Sent Events / Streamable HTTP POST |

---

## 2. Connecting Claude Desktop (STDIO)

### Step 1: Generate an MCP Access Token
1. Log in to the Missive SEO Intelligence web application as an Administrator or SEO Manager.
2. Navigate to **Agency Settings > MCP Server** (`/settings/mcp`).
3. Click **Generate MCP Token**.
4. Select **STDIO (Desktop Subprocess)** as the transport and specify a client name (e.g. `Claude Desktop`).
5. Copy the generated token immediately (`mcp_live_...`). Note that this raw secret is never stored in plaintext and cannot be shown again.

### Step 2: Configure `claude_desktop_config.json`
Locate your Claude Desktop configuration file:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add the `missive-seo-intelligence` server entry:

```json
{
  "mcpServers": {
    "missive-seo": {
      "command": "node",
      "args": [
        "c:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/mcp-server/src/server.js"
      ],
      "env": {
        "NODE_ENV": "production",
        "MCP_ACCESS_TOKEN": "mcp_live_YOUR_GENERATED_TOKEN_HERE"
      }
    }
  }
}
```

### Step 3: Restart Claude Desktop
Restart the Claude Desktop application. The hammer icon will appear in the bottom right corner showing 20 tools registered.

---

## 3. Connecting Remote Clients (Streamable HTTP)

### HTTP Endpoint
`POST http://localhost:5000/api/v1/mcp`

### Headers Required
```http
Authorization: Bearer mcp_live_<your_token>
Content-Type: application/json
Accept: application/json, text/event-stream
```

### Example: Connecting Cursor IDE
In Cursor **Settings > Features > MCP**:
1. Click **+ Add New MCP Server**.
2. **Name**: `missive-seo`
3. **Type**: `command` (or `SSE`/`Streamable HTTP` when remote)
4. **Command**:
   ```bash
   node c:/Users/info/OneDrive/Desktop/SEO-Report/missive-seo-intelligence/mcp-server/src/server.js
   ```

---

## 4. Exposed MCP Capabilities

### Tool Catalog (20 Tools)

#### Group A: Website Tools
1. `list_websites` — List all accessible client websites in workspace with connection status.
2. `get_website_overview` — Cross-platform performance overview with data freshness indicator.
3. `get_website_integrations` — Provider connection and synchronization health.

#### Group B: Google Analytics 4 Tools
4. `get_ga4_summary` — Core KPIs: active users, sessions, engagement rate, bounce rate.
5. `get_ga4_traffic_trends` — Daily organic session timeline.
6. `get_ga4_traffic_sources` — Breakdown by source, medium, and acquisition channel.
7. `get_ga4_landing_pages` — Top landing pages by organic sessions.

#### Group C: Google Search Console Tools
8. `get_gsc_summary` — Aggregate clicks, impressions, CTR, and average SERP position.
9. `get_gsc_keyword_performance` — Query-level clicks, impressions, and ranking distributions.
10. `get_gsc_page_performance` — URL-level search performance.
11. `get_gsc_ranking_movements` — Position improvements and drop-offs between comparison periods.

#### Group D: Microsoft Clarity Tools
12. `get_clarity_summary` — High-level UX friction: rage clicks, dead clicks, quick backs, script errors.
13. `get_clarity_page_insights` — Page-level UX anomaly hotspots.

#### Group E: Deterministic SEO Analysis Tools
14. `get_seo_findings` — Active issues detected by the deterministic analysis engine.
15. `get_keyword_opportunities` — Striking distance queries (positions 4 to 20).
16. `get_traffic_drop_analysis` — Automated root-cause analysis for organic traffic declines.
17. `get_content_decay_analysis` — Pages suffering steady decay over 3 to 6 months.
18. `get_clarity_behaviour_findings` — High UX friction pages hurting conversions.

#### Group F: Comparison Tools
19. `compare_website_periods` — Custom date range comparison with percentage deltas.
20. `compare_websites` — Side-by-side comparison across 2 to 10 authorized client websites.

---

### Resources (`seo://...`)
- `seo://websites` — Real-time list of all accessible websites in the current workspace.
- `seo://analytics/info` — Metadata on available analytics providers and metrics.
- `seo://analysis/engines` — Catalog of deterministic SEO engines and severity rules.

---

### Standardized Prompts
- `seo_website_review` — Step-by-step comprehensive SEO audit procedure.
- `investigate_organic_traffic_drop` — Guided diagnostic workflow for traffic drops.
- `keyword_opportunity_review` — Striking distance keyword prioritisation prompt.
- `landing_page_review` — Holistic organic traffic and UX friction review.
- `monthly_seo_review` — Executive monthly summary template for clients.

---

## 5. Security & Tenant Scoping Rules

1. **Read-Only Guarantee**: Tools are strictly read-only. No mutation, website modification, or database write operations are exposed.
2. **Credential Redaction**: API keys, OAuth refresh tokens, password hashes, and encryption keys are deeply redacted before tool responses are returned.
3. **Workspace Isolation**: Users and MCP tokens cannot read data from other workspaces. Cross-workspace access attempts are rejected with `403 Forbidden`.
4. **Audit Logging**: Every tool execution is recorded in the `MCPToolExecutionLog` database table, capturing the timestamp, client name, parameters, execution duration, and success status.

---

## 6. Token Revocation & Management

If a token is compromised or a client is decommissioned:
1. Open **Agency Settings > MCP Server** (`/settings/mcp`).
2. Locate the token under **Active MCP Tokens**.
3. Click **Revoke**. Revocation takes effect immediately without requiring a server restart.
