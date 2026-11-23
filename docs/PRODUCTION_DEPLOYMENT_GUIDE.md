# Production Deployment & Operations Guide
## Missive Digital SEO Intelligence Platform

**Document Version:** 1.0.0  
**Target Environment:** Linux (Ubuntu 22.04 LTS / Debian 12 / RHEL 9) or Docker Containerized  
**Application Stack:** Node.js (v20+ LTS), React 18 / Vite, MySQL 8.0, Redis 7.x, Ollama Local AI  

---

## 1. Architectural Topology

```
                              [ HTTPS (443) ]
                                     │
                                     ▼
                   ┌───────────────────────────────────┐
                   │        Nginx Reverse Proxy        │
                   │  - SSL/TLS 1.3 Termination        │
                   │  - Security Headers (HSTS/CSP)    │
                   │  - Rate Limiting at Edge          │
                   │  - Static Asset Delivery          │
                   └───────┬───────────────────┬───────┘
                           │                   │
         /api, /mcp-sse    │                   │ / (Static UI)
                           ▼                   ▼
            ┌───────────────────────────┐    ┌─────────────────┐
            │   Node.js Web API         │    │ Vite Production │
            │   (PM2 Cluster: 2-4 procs)│    │ Dist (SPA)      │
            └─────────┬────────┬────────┘    └─────────────────┘
                      │        │
     Queue Jobs       │        │ Query / Write
         ┌────────────┘        └────────────┐
         ▼                                  ▼
┌─────────────────┐                ┌─────────────────┐
│ BullMQ Workers  │                │  MySQL 8.0 DB   │
│ - Sync Worker   │                │  (InnoDB Engine)│
│ - Analysis Wkr  │                │  Prisma Managed │
│ - Report Worker │                └─────────────────┘
└────────┬────────┘
         │
         ▼
┌─────────────────┐                ┌─────────────────┐
│ Redis 7.x       │                │ Ollama Local AI │
│ - BullMQ State  │                │ - Qwen Model    │
│ - Rate Limiting │                │ - Loopback Only │
└─────────────────┘                └─────────────────┘
```

---

## 2. Server Sizing & System Prerequisites

### Hardware Requirements
- **Standard Agency Production Profile (Up to 100 Clients / 500 Websites):**
  - **CPU:** 8 vCPUs (Intel Xeon / AMD EPYC / AWS c6i.2xlarge).
  - **Memory:** 32 GB RAM (Ollama Qwen model requires 8-16 GB dedicated RAM/VRAM).
  - **Disk:** 100 GB NVMe SSD (database storage, Redis persistence, and PDF/Excel report cache).
  - **GPU (Optional but Recommended):** NVIDIA T4 or A10G for sub-second Ollama inference.

### Software Prerequisites
- **Operating System:** Ubuntu 22.04 LTS or Debian 12
- **Node.js:** v20.12.0 LTS or v22.x LTS (ES Modules enabled)
- **MySQL:** 8.0.32+
- **Redis:** 7.0+
- **Nginx:** 1.22+
- **Ollama:** 0.4.0+
- **Process Manager:** PM2 v5.3+ (`npm install -g pm2`)

---

## 3. Production Environment Configuration

Create `/etc/missive/seo-intelligence.env` (permissions: `chmod 600`, owned by application user `missive`):

```bash
# =============================================================================
# ENVIRONMENT & CORE
# =============================================================================
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://seo.missivedigital.com
BACKEND_URL=https://seo.missivedigital.com/api/v1

# =============================================================================
# DATABASE (MySQL 8.0)
# =============================================================================
# Format: mysql://USER:PASSWORD@HOST:PORT/DATABASE?connection_limit=25&sslmode=require
DATABASE_URL="mysql://missive_app:SECURE_DB_PASSWORD@127.0.0.1:3306/missive_seo?connection_limit=25&pool_timeout=10"

# =============================================================================
# REDIS (BullMQ & Rate Limiting)
# =============================================================================
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=SECURE_REDIS_PASSWORD
REDIS_DB=0

# =============================================================================
# SECURITY KEYS & SECRETS (Generate with: openssl rand -hex 32)
# =============================================================================
# 32-byte hex key for AES-256-GCM token and credential encryption
ENCRYPTION_KEY=1f7c8b4e9a0d2f5e8b1c4a7d0e3f6a9b2c5e8a1d4f7b0e3c6a9d2f5e8b1c4a7d

# JWT Authentication Secrets
JWT_SECRET=e4b7a1c8f92d0e3b6a5f8c1d4e7a0b3f6c9e2a5d8b1f4c7e0a3d6f9b2c5e8a1d
JWT_ACCESS_EXPIRY=15m
REFRESH_TOKEN_SECRET=a9d2f5e8b1c4a7d0e3f6a9b2c5e8a1d4f7b0e3c6a9d2f5e8b1c4a7d0e3f6a9b2
REFRESH_TOKEN_EXPIRY=7d

# Cookie Security
COOKIE_DOMAIN=.missivedigital.com
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax

# =============================================================================
# THIRD-PARTY INTEGRATION CREDENTIALS
# =============================================================================
# Google Cloud Console OAuth 2.0 (Google Analytics 4 & Google Search Console)
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=https://seo.missivedigital.com/api/v1/integrations/google/callback

# Microsoft Clarity
CLARITY_API_BASE_URL=https://www.clarity.ms/export-data/api/v1

# =============================================================================
# LOCAL AI ASSISTANT (Ollama — Loopback Interface Only)
# =============================================================================
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
OLLAMA_TIMEOUT_MS=60000

# =============================================================================
# LOGGING & STORAGE
# =============================================================================
LOG_LEVEL=info
LOG_DIR=/var/log/missive-seo
REPORT_STORAGE_DIR=/var/lib/missive-seo/reports
```

> [!CAUTION]
> **Key Management Rule:** Never commit `.env` or production secrets into Git repositories. Store production secrets in a dedicated secret store (e.g., HashiCorp Vault, AWS Secrets Manager, or Doppler).

---

## 4. Database Setup & Hardening

### 1. MySQL User Least-Privilege Provisioning
Run as MySQL root:

```sql
CREATE DATABASE missive_seo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'missive_app'@'127.0.0.1' IDENTIFIED BY 'SECURE_DB_PASSWORD';

-- Grant required operational privileges (exclude dangerous admin rights)
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, INDEX, ALTER, REFERENCES ON missive_seo.* TO 'missive_app'@'127.0.0.1';

FLUSH PRIVILEGES;
```

### 2. Apply Prisma Migrations
On the deployment machine:

```bash
cd /opt/missive-seo/backend
export $(cat /etc/missive/seo-intelligence.env | xargs)
npx prisma migrate deploy
```

### 3. Automated Daily Backup Script
Save as `/usr/local/bin/backup-missive-db.sh` (`chmod 700`):

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/missive-seo"
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/missive_seo_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump database with single transaction consistency
mysqldump -u missive_app -p'SECURE_DB_PASSWORD' \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  missive_seo | gzip > "$BACKUP_FILE"

# Enforce 30-day retention
find "$BACKUP_DIR" -type f -name "missive_seo_*.sql.gz" -mtime +30 -delete

logger -t missive-backup "Database backup completed: ${BACKUP_FILE}"
```

Add to crontab (`crontab -e`):
```cron
0 2 * * * /usr/local/bin/backup-missive-db.sh > /dev/null 2>&1
```

---

## 5. Redis Persistence & Sizing

Configure `/etc/redis/redis.conf`:

```ini
# Bind strictly to loopback
bind 127.0.0.1 ::1
protected-mode yes
port 6379
requirepass SECURE_REDIS_PASSWORD

# Persistence: AOF + Periodic RDB
appendonly yes
appendfsync everysec
save 900 1
save 300 10
save 60 10000

# Memory Management for BullMQ (CRITICAL)
# BullMQ requires that queued jobs are NOT evicted by Redis under memory pressure
maxmemory 2gb
maxmemory-policy noeviction
```

Restart Redis:
```bash
sudo systemctl restart redis-server
```

---

## 6. Local Ollama Service Configuration

Ollama must run strictly on loopback (`127.0.0.1`) and never bind to `0.0.0.0`.

Configure systemd drop-in `/etc/systemd/system/ollama.service.d/override.conf`:

```ini
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_ORIGINS=http://127.0.0.1:*,http://localhost:*"
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_NUM_PARALLEL=2"
```

Reload and verify:
```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama

# Pull the production model
ollama pull qwen2.5:7b-instruct

# Verify model presence
curl -s http://127.0.0.1:11434/api/tags | grep qwen
```

---

## 7. Process Management with PM2

To ensure high availability and prevent long-running report generation or data synchronisation tasks from blocking HTTP API responses, the application is divided into **Web API** and **Background Workers**.

Create `/opt/missive-seo/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: 'missive-api',
      script: './src/server.js',
      cwd: '/opt/missive-seo/backend',
      instances: 2,
      exec_mode: 'cluster',
      env_file: '/etc/missive/seo-intelligence.env',
      max_memory_restart: '1G',
      kill_timeout: 5000,
      listen_timeout: 8000,
      time: true,
      error_file: '/var/log/missive-seo/api-err.log',
      out_file: '/var/log/missive-seo/api-out.log',
      merge_logs: true,
    },
    {
      name: 'missive-workers',
      script: './src/workers/index.js',
      cwd: '/opt/missive-seo/backend',
      instances: 1,
      exec_mode: 'fork',
      env_file: '/etc/missive/seo-intelligence.env',
      max_memory_restart: '2G',
      kill_timeout: 15000, // Allow background report rendering to finish
      time: true,
      error_file: '/var/log/missive-seo/workers-err.log',
      out_file: '/var/log/missive-seo/workers-out.log',
    },
  ],
};
```

Start the processes:
```bash
pm2 start /opt/missive-seo/ecosystem.config.cjs
pm2 save
pm2 startup systemd
```

---

## 8. Nginx Reverse Proxy & Edge Security

Create `/etc/nginx/sites-available/missive-seo`:

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=60r/m;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

# HTTP -> HTTPS Redirect
server {
    listen 80;
    listen [::]:80;
    server_name seo.missivedigital.com;
    return 301 https://$host$request_uri;
}

# Production HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name seo.missivedigital.com;

    # SSL Certificates (Let's Encrypt or Commercial CA)
    ssl_certificate /etc/letsencrypt/live/seo.missivedigital.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seo.missivedigital.com/privkey.pem;

    # Modern TLS Hardening
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://seo.missivedigital.com;" always;

    # Root for Vite React SPA
    root /opt/missive-seo/frontend/dist;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss font/eot font/otf image/svg+xml;

    # Static Assets with Cache Control
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, no-transform, immutable";
    }

    # Auth API Rate Limiting
    location ~* ^/api/v1/auth/(login|register|forgot-password) {
        limit_req zone=auth_limit burst=5 nodelay;
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # General API Endpoints
    location /api/ {
        limit_req zone=api_limit burst=30 nodelay;
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }

    # Model Context Protocol (MCP) Streamable HTTP / SSE Endpoint
    location /api/v1/mcp/message {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
        proxy_read_timeout 300s;
    }

    # React SPA Fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/missive-seo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 9. Health Monitoring & Alerting

### Production Endpoints
- **Liveness Probe:** `GET /api/v1/health` (Returns `200 OK` if Node.js server process is responsive).
- **Detailed Readiness Probe:** `GET /api/v1/health/detailed` (Evaluates MySQL, Redis, BullMQ queues, Ollama, and MCP subsystem).

### Automated Uptime Check (Cron / Uptime Robot / Datadog)
Configure external probe to poll `https://seo.missivedigital.com/api/v1/health/detailed` every 60 seconds:
- Status `200` with `"status": "healthy"`: All subsystems operational.
- Status `200` with `"status": "degraded"`: Database operational; background worker or Ollama offline.
- Status `503` with `"status": "unhealthy"`: Critical failure (database down). Triggers PagerDuty / Ops alert.

---

## 10. Disaster Recovery & Incident Response Runbook

### Scenario A: Compromised User Credentials / Stolen Session
To immediately revoke all active sessions for a compromised user account:
1. Log into backend terminal or admin shell:
```bash
cd /opt/missive-seo/backend
node -e "
import prisma from './src/config/database.js';
await prisma.refreshToken.updateMany({
  where: { userId: 'TARGET_USER_ID', revokedAt: null },
  data: { revokedAt: new Date() }
});
console.log('All user sessions revoked successfully.');
process.exit(0);
"
```
2. Trigger password reset via `/api/v1/auth/reset-password`.

### Scenario B: Emergency Key Rotation
If `ENCRYPTION_KEY` is suspected to be exposed:
1. Generate new 32-byte key: `openssl rand -hex 32`.
2. Run database re-encryption utility:
```bash
node ./scripts/rotate-encryption-keys.js --oldKey=OLD_HEX --newKey=NEW_HEX
```
3. Update `/etc/missive/seo-intelligence.env` with new `ENCRYPTION_KEY`.
4. Gracefully restart PM2: `pm2 reload ecosystem.config.cjs`.
