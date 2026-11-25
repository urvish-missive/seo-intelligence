# Missive SEO Intelligence Platform

> An enterprise, agency-grade SEO Intelligence Platform for Missive Digital.  
> Local-first. Privacy-preserving. Zero Cloud AI Egress. Powered by Ollama & Qwen.

---

## 1. Project Overview

The **Missive SEO Intelligence Platform** is a complete, multi-tenant SEO intelligence and client reporting system built for modern digital agencies. It connects directly to Google Analytics 4 (GA4), Google Search Console (GSC), and Microsoft Clarity, stores normalized metrics in a local MySQL relational database, performs deterministic metric and anomaly analysis, and powers an intelligent local AI assistant using **Ollama** running the **Qwen** open-weights LLM.

**Core Privacy Principle:** All client data, search queries, performance metrics, and proprietary analysis remain on local agency infrastructure. **No client data or prompts are ever transmitted to remote AI APIs.**

---

## 2. Technology Stack

### Frontend
- **Framework:** React 18 with Vite
- **Language:** JavaScript (ES Modules)
- **Styling:** Tailwind CSS & Lucide React
- **State & Data Fetching:** Redux Toolkit & RTK Query
- **Routing & Forms:** React Router 7, React Hook Form, Zod

### Backend
- **Runtime:** Node.js (v20+ LTS)
- **Framework:** Express.js (Modular Monolith)
- **Database & ORM:** MySQL 8.0 with Prisma ORM
- **Cache & Queues:** Redis 7 with BullMQ
- **Security & Crypto:** Argon2id, AES-256-GCM, HMAC-SHA256, Helmet, express-rate-limit

### Local AI & Integrations
- **AI Inference:** Ollama running `qwen2.5:7b-instruct` (strictly loopback interface)
- **Integrations:** Google Analytics 4 Data API, Google Search Console API, Microsoft Clarity Export API
- **Model Context Protocol:** Official MCP SDK for JavaScript (STDIO & Streamable HTTP transports)
- **Document Generation:** PDFKit (custom agency PDFs) and ExcelJS (formula-injection-protected spreadsheets)

---

## 3. Implementation Status Across Phases

| Phase | Title | Status | Deliverables |
| :--- | :--- | :---: | :--- |
| **Phase 1** | Foundation & Architecture | ✅ **Completed** | Monorepo structure, Prisma models, MySQL migrations, Health endpoints |
| **Phase 2** | Auth, RBAC & Multi-Tenancy | ✅ **Completed** | Argon2id, JWT/Refresh tokens, Workspaces, Clients, Websites, RBAC |
| **Phase 3** | Google GA4 & GSC Integration | ✅ **Completed** | OAuth 2.0 flow, token encryption (AES-256-GCM), GA4 & GSC data clients |
| **Phase 4** | Microsoft Clarity Integration | ✅ **Completed** | Project mapping, token encryption, UX frustration metric ingestion |
| **Phase 5** | Background Sync Engine | ✅ **Completed** | BullMQ workers, Redis queues, distributed locks, repeatable cron |
| **Phase 6** | Analytics Dashboard UI | ✅ **Completed** | Multi-client overview, KPI cards, Recharts time-series, device splits |
| **Phase 7** | SEO Analysis Engine | ✅ **Completed** | Deterministic audit algorithms, keyword opportunities, traffic-drop checks |
| **Phase 8** | Local AI Assistant | ✅ **Completed** | Ollama integration, prompt guardrails, grounded SQL context, SSE streaming |
| **Phase 9** | Model Context Protocol Server | ✅ **Completed** | Official MCP SDK, 20 tools, 3 resources, 3 prompts, STDIO & HTTP |
| **Phase 10** | Reporting & Export System | ✅ **Completed** | 6 report templates, PDFKit generator, ExcelJS with formula injection defense |
| **Phase 11** | Security Audit & QA | ✅ **Completed** | 24 test suites, 183 tests passed (100%), tenant isolation verification |
| **Phase 12** | Deployment & Handover | ✅ **Completed** | Docker Compose, PM2 ecosystem, Nginx config, CI/CD, backup & recovery runbook |

---

## 4. Repository Structure

```
missive-seo-intelligence/
├── backend/                  # Node.js + Express backend application
│   ├── prisma/               # Prisma schema, migrations, and seed scripts
│   ├── src/
│   │   ├── config/           # Database, Redis, Environment, Logger
│   │   ├── middleware/       # Auth, RBAC, Tenant Isolation, Rate Limiters, Error Handling
│   │   ├── modules/          # Domain modules (Auth, Clients, Websites, Integrations, etc.)
│   │   ├── queues/           # BullMQ queue producers and configs
│   │   ├── workers/          # BullMQ queue consumers (Sync, Analysis, Reports)
│   │   ├── mcp/              # MCP Server (Tools, Resources, Prompts, Transports)
│   │   └── utils/            # AES-256-GCM, Formula sanitizer, Date arithmetic
│   └── tests/                # 24 Unit & Integration test suites (183 tests)
├── frontend/                 # React + Vite frontend application
│   ├── public/               # Static web assets
│   └── src/
│       ├── app/              # Redux store configuration
│       ├── features/         # RTK Query APIs, Redux slices, feature components
│       ├── pages/            # View pages (Analytics, Reports, AI, MCP, Settings)
│       └── components/       # Shared UI primitives (Modal, Table, Badge, Card)
├── docs/                     # Comprehensive engineering & operations documentation
├── scripts/                  # Automated backup and restoration shell scripts
├── .github/workflows/        # Automated CI/CD pipelines
├── docker-compose.yml        # Development infrastructure (MySQL 8 + Redis 7)
├── docker-compose.prod.yml   # Production containerized deployment configuration
├── nginx.conf                # Production reverse proxy configuration
└── ecosystem.config.cjs      # PM2 process manager configuration
```

---

## 5. Quick Start (Local Development)

### 1. Launch Infrastructure
Start MySQL and Redis using Docker Compose:
```bash
docker compose up -d
```

### 2. Start Local AI
Start Ollama and pull the recommended model:
```bash
ollama serve
ollama pull qwen2.5:7b
```

### 3. Backend Setup
```bash
cd backend
cp ../.env.example .env
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

### 4. Background Workers (Separate Terminal)
```bash
cd backend
npm run workers
```

### 5. Frontend Setup (Separate Terminal)
```bash
cd frontend
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.

### Integration and AI checklist

- Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `backend/.env`. In Google Cloud, enable the Google Search Console API and Google Analytics Data API, and register the exact `GOOGLE_REDIRECT_URI` as an authorized redirect URI.
- Connect the Google account in the app, then associate the correct Search Console property with each website. OAuth connection alone does not select a property or import its metrics.
- Create a Microsoft Clarity Data Export API token, connect the project, map it to the website, then run a Clarity sync. Clarity's export API is limited to rolling windows of 1–3 days and has a per-project daily request quota.
- Start `npm run workers` in a separate backend terminal for queued and scheduled syncs. If Redis is not running, manual sync falls back to a background task in the API process; keep that process running until the job completes.
- For the local AI assistant, keep Ollama running at `OLLAMA_BASE_URL` and install the exact configured `OLLAMA_MODEL` (default `qwen2.5:7b`). Check `GET /api/v1/workspaces/:workspaceId/ai/health` or the AI status in the app if responses are unavailable.
- For a local MCP smoke check, open another terminal in `backend` and run `npm run mcp:stdio`. The backend also mounts Streamable HTTP MCP at `/api/v1/mcp` for clients using a workspace MCP token.
- For an MCP desktop client, run `backend/src/mcp/transports/stdio.transport.js` from the `backend` directory so it loads `backend/.env`. Avoid copying database passwords or encryption keys into shared MCP config files.

---

## 6. Running Tests

Run the complete automated verification test suite:

```bash
cd backend
npm test
```
*Current test suite passing status: 24 test suites, 183 tests passed (100%).*

---

## 7. Documentation Index

Detailed engineering, security, and operations documentation is located in the `docs/` directory:

- [System Architecture](docs/ARCHITECTURE.md)
- [Local Development Setup](docs/LOCAL_SETUP.md)
- [Production Deployment](docs/PRODUCTION_DEPLOYMENT.md)
- [Database Backup & Recovery Runbook](docs/BACKUP_RECOVERY.md)
- [Security & Cryptography Guidelines](docs/SECURITY.md)
- [Model Context Protocol (MCP) Setup](docs/MCP_SETUP.md)
- [Operations & Maintenance Manual](docs/OPERATIONS.md)
- [Phase 11 QA & Security Audit Report](docs/PHASE_11_COMPLETION_REPORT.md)
- [Reporting System Guide](docs/REPORTING_SYSTEM_GUIDE.md)

---

## 8. License

Proprietary & Confidential — Missive Digital. All rights reserved.
