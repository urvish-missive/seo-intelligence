# Production Deployment Guide
## Missive Digital SEO Intelligence Platform

This document outlines the standard production deployment procedure for the Missive Digital SEO Intelligence Platform on dedicated Linux instances (Ubuntu 22.04 LTS / Debian 12) or containerized environments.

---

## 1. Production Architecture Overview

In production, the platform decouples the interactive web API from long-running background tasks (analytics ingestion, deterministic SEO analysis, PDF/Excel rendering):

```
                       [ HTTPS Traffic: Port 443 ]
                                   │
                                   ▼
                      ┌───────────────────────────┐
                      │    Nginx Reverse Proxy    │
                      │  - TLS 1.3 Termination    │
                      │  - Rate Limiting at Edge  │
                      │  - CSP / HSTS Headers     │
                      └──────┬─────────────┬──────┘
                             │             │
                    /api/v1  │             │ / (Static Files)
                             ▼             ▼
             ┌────────────────────────┐  ┌──────────────────┐
             │ Node.js Web API        │  │ Vite Production  │
             │ (PM2 Cluster: 2-4 procs)  │  │ Dist (SPA Build)  │
             └───────────┬────────────┘  └──────────────────┘
                         │
         Enqueue Jobs    │
                         ▼
             ┌────────────────────────┐
             │ Redis 7.x (BullMQ)     │
             │ maxmemory-policy:      │
             │ noeviction             │
             └───────────┬────────────┘
                         │
                         ▼
             ┌────────────────────────┐
             │ BullMQ Workers Cluster │
             │ - Sync Worker          │
             │ - Analysis Worker      │
             │ - Report Worker        │
             └───────────┬────────────┘
                         │
                         ▼
             ┌────────────────────────┐  ┌──────────────────┐
             │ MySQL 8.0 Database     │  │ Ollama Local AI  │
             │ (InnoDB, utf8mb4)      │  │ (127.0.0.1:11434)│
             └────────────────────────┘  └──────────────────┘
```

---

## 2. Infrastructure Sizing & Requirements

| Component | Minimum Specification | Recommended Production Profile |
| :--- | :--- | :--- |
| **Server / Instance** | 4 vCPU, 16 GB RAM | 8 vCPU, 32 GB RAM (e.g. AWS c6i.2xlarge or Hetzner AX52) |
| **Storage** | 50 GB NVMe SSD | 150 GB NVMe SSD with automated EBS/Volume snapshots |
| **Operating System** | Ubuntu 22.04 LTS / Debian 12 | Ubuntu 22.04 LTS (HWE Kernel) |
| **Node.js** | v20.12.0 LTS | v20 LTS / v22 LTS |
| **MySQL** | 8.0.32+ | Managed MySQL 8.0 (AWS RDS / GCP Cloud SQL / Percona) |
| **Redis** | 7.0+ | Redis 7 with AOF persistence enabled |
| **Ollama** | 0.4.0+ | Ollama daemon bound strictly to `127.0.0.1:11434` |

---

## 3. Server Provisioning & System Preparation

Run on the target server as `root` or `sudo`:

```bash
# 1. Update OS packages
sudo apt update && sudo apt upgrade -y

# 2. Install essential system utilities
sudo apt install -y curl wget git build-essential nginx certbot python3-certbot-nginx

# 3. Install Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Install PM2 globally
sudo npm install -g pm2

# 5. Create dedicated application system user
sudo useradd -m -s /bin/bash missive
sudo mkdir -p /opt/missive-seo /var/lib/missive-seo/reports /var/log/missive-seo /var/backups/missive-seo
sudo chown -R missive:missive /opt/missive-seo /var/lib/missive-seo /var/log/missive-seo /var/backups/missive-seo
```

---

## 4. Application Deployment Steps

### 1. Deploy Codebase
Switch to the application user and clone the repository:

```bash
sudo su - missive
cd /opt/missive-seo
git clone <REPOSITORY_URL> .
```

### 2. Configure Environment Variables
Copy and configure the production environment file:

```bash
cp .env.production.example /etc/missive/seo-intelligence.env
chmod 600 /etc/missive/seo-intelligence.env
```
*(Ensure all secrets, database URLs, and encryption keys are generated and securely populated).*

### 3. Install Backend Dependencies & Apply Migrations
```bash
cd /opt/missive-seo/backend
export $(cat /etc/missive/seo-intelligence.env | xargs)
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy
```

### 4. Build Frontend Assets
```bash
cd /opt/missive-seo/frontend
npm ci
VITE_API_BASE_URL="/api/v1" npm run build
```

---

## 5. Process Management (PM2 Ecosystem)

Create `/opt/missive-seo/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: 'missive-api',
      script: './src/server.js',
      cwd: '/opt/missive-seo/backend',
      instances: 'max', // Scale to all available CPU cores
      exec_mode: 'cluster',
      env_file: '/etc/missive/seo-intelligence.env',
      max_memory_restart: '1G',
      kill_timeout: 5000,
      listen_timeout: 8000,
      error_file: '/var/log/missive-seo/api-error.log',
      out_file: '/var/log/missive-seo/api-out.log',
      merge_logs: true,
    },
    {
      name: 'missive-workers',
      script: './src/workers/index.js',
      cwd: '/opt/missive-seo/backend',
      instances: 1, // Workers must run in fork mode to prevent job race conditions
      exec_mode: 'fork',
      env_file: '/etc/missive/seo-intelligence.env',
      max_memory_restart: '2G',
      kill_timeout: 30000, // 30s grace period for in-progress report rendering
      error_file: '/var/log/missive-seo/workers-error.log',
      out_file: '/var/log/missive-seo/workers-out.log',
    },
  ],
};
```

Start the services with PM2:
```bash
pm2 start /opt/missive-seo/ecosystem.config.cjs
pm2 save
pm2 startup systemd -u missive --hp /home/missive
```

---

## 6. SSL & Nginx Reverse Proxy Configuration

Configure `/etc/nginx/sites-available/missive-seo`:

```nginx
# Rate Limiting Zones
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

    # SSL Certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/seo.missivedigital.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seo.missivedigital.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://seo.missivedigital.com;" always;

    root /opt/missive-seo/frontend/dist;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css text/xml application/json application/javascript image/svg+xml;

    # Static Assets Cache
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, no-transform, immutable";
    }

    # Auth Endpoints Rate Limiting
    location ~* ^/api/v1/auth/(login|register|forgot-password) {
        limit_req zone=auth_limit burst=5 nodelay;
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API Proxy
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
        chunked_transfer_encoding on;
        proxy_read_timeout 300s;
    }

    # SPA Client Route Fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable site and acquire SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/missive-seo /etc/nginx/sites-enabled/
sudo nginx -t
sudo certbot --nginx -d seo.missivedigital.com
sudo systemctl reload nginx
```

---

## 7. Zero-Downtime Deployment Command Sequence

For subsequent application releases:

```bash
cd /opt/missive-seo
git pull origin main
cd backend
npm ci --omit=dev
npx prisma migrate deploy
cd ../frontend
npm ci
VITE_API_BASE_URL="/api/v1" npm run build
pm2 reload /opt/missive-seo/ecosystem.config.cjs
```
