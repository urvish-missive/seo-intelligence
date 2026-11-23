# Day-to-Day Operations & Maintenance Manual
## Missive Digital SEO Intelligence Platform

This manual provides operational guidance for site reliability engineers (SREs), system administrators, and DevOps personnel managing the Missive Digital SEO Intelligence Platform in production.

---

## 1. System Health Monitoring

### Health Endpoints
- **Liveness Probe:** `GET /api/v1/health`
  - Returns `200 OK` if the Express HTTP server process is responsive.
- **Readiness Probe:** `GET /api/v1/health/detailed`
  - Evaluates MySQL, Redis, BullMQ queues, Ollama AI, and MCP registration.

#### Response Status Interpretation:
```json
{
  "success": true,
  "status": "healthy",
  "service": "missive-seo-backend",
  "version": "1.0.0",
  "checks": {
    "database": { "status": "healthy", "message": "Connected" },
    "redis": { "status": "healthy", "message": "Connected — background jobs active" },
    "queues": {
      "status": "healthy",
      "message": "All 3 BullMQ queues operational (sync, analysis, reports)",
      "details": {
        "sync": { "waiting": 0, "active": 1, "failed": 0, "completed": 142 },
        "analysis": { "waiting": 0, "active": 0, "failed": 0, "completed": 98 },
        "reports": { "waiting": 0, "active": 0, "failed": 0, "completed": 45 }
      }
    },
    "ollama": { "status": "healthy", "message": "Connected — model qwen2.5:7b-instruct available" },
    "mcp": { "status": "healthy", "details": { "toolsCount": 20 } }
  }
}
```
- **`healthy` (HTTP 200):** All subsystems normal.
- **`degraded` (HTTP 200):** Database operational, but Redis or Ollama unavailable. Interactive API features work; background sync or AI assistant paused.
- **`unhealthy` (HTTP 503):** Database down. Triggers automated paging alert.

---

## 2. Process & Worker Management (PM2)

### Standard Commands
```bash
# Check status of API cluster and background workers
pm2 status

# Real-time streaming logs
pm2 logs

# View logs for specific process
pm2 logs missive-api --lines 100
pm2 logs missive-workers --lines 100

# Zero-downtime reload of API processes
pm2 reload missive-api

# Restart background workers
pm2 restart missive-workers

# Monitor CPU and Memory metrics in terminal
pm2 monit
```

### Worker Behavior on Restart
- **Graceful Shutdown:** When `missive-workers` receives a restart or `SIGTERM`, BullMQ waits up to 30 seconds for in-progress PDF/Excel generation or data sync jobs to complete.
- **No Lost Jobs:** Unprocessed jobs remain safely stored in Redis (`missive-seo-*` queues) and resume immediately once the worker restarts.
- **No Duplicate Schedules:** Repeatable schedule definitions use deterministic BullMQ job keys (`sched:<id>`); restarting the API or worker does not generate duplicate scheduled runs.

---

## 3. Investigating & Retrying Failed Jobs

### Checking Redis Queues Directly
```bash
redis-cli -a "$REDIS_PASSWORD"

# View queue length
LLEN "bull:missive-seo-sync:wait"
LLEN "bull:missive-seo-reports:wait"

# Inspect failed jobs
ZRANGE "bull:missive-seo-sync:failed" 0 -1 WITHSCORES
```

### Inspecting Sync Job Errors via SQL
```sql
SELECT id, websiteId, provider, status, attempts, errorMessage, createdAt, completedAt
FROM SyncJob
WHERE status = 'FAILED'
ORDER BY createdAt DESC
LIMIT 10;
```

#### Common Sync Failure Root Causes:
1. **Google OAuth Token Revoked or Expired:**
   - **Symptom:** `invalid_grant` error in logs.
   - **Fix:** Notify user to navigate to **Website Settings > Integrations** and click **Reconnect Google Account**.
2. **Google API Quota Limit:**
   - **Symptom:** `Quota exceeded for quota metric 'Queries'`.
   - **Fix:** Exponential backoff will automatically retry in 5 minutes. Adjust `DEFAULT_SYNC_INTERVAL_MINUTES` if agency has many high-volume sites.
3. **Microsoft Clarity Token Invalid:**
   - **Symptom:** `401 Unauthorized from Clarity API`.
   - **Fix:** Re-enter project token in website integration settings.

---

## 4. Local Ollama AI Maintenance

### Verify Daemon & Model Status
```bash
# Check if Ollama daemon is running
sudo systemctl status ollama

# Test Ollama API
curl http://127.0.0.1:11434/api/tags

# Test inference directly
curl http://127.0.0.1:11434/api/generate -d '{
  "model": "qwen2.5:7b-instruct",
  "prompt": "Hello",
  "stream": false
}'
```

### Updating or Changing the AI Model
To upgrade to a newer model:
```bash
# 1. Pull the new model
ollama pull qwen2.5:14b-instruct

# 2. Update environment variable in /etc/missive/seo-intelligence.env:
OLLAMA_MODEL=qwen2.5:14b-instruct

# 3. Gracefully reload PM2 processes:
pm2 reload /opt/missive-seo/ecosystem.config.cjs

# 4. Remove old model to reclaim disk space:
ollama rm qwen2.5:7b-instruct
```

---

## 5. Storage & Disk Usage Maintenance

### Temporary Files Cleanup
Add a weekly cron job to clean up orphaned temporary report files (`crontab -e -u missive`):

```cron
# Every Sunday at 03:00 AM, remove temporary files older than 7 days
0 3 * * 0 find /var/lib/missive-seo/reports/temp -type f -mtime +7 -delete
```

### Log Rotation
Configure `/etc/logrotate.d/missive-seo`:

```ini
/var/log/missive-seo/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 missive missive
}
```

---

## 6. Incident Response Playbooks

### Playbook 1: Database Connection Pool Exhausted (`P2024 / Connection timeout`)
1. Check current MySQL connection count:
   ```sql
   SHOW GLOBAL STATUS LIKE 'Threads_connected';
   SHOW PROCESSLIST;
   ```
2. If `Threads_connected` is near `max_connections`, verify `connection_limit=25` in `DATABASE_URL`.
3. Terminate orphaned sleeping connections:
   ```bash
   mysqladmin -u root -p kill <THREAD_ID>
   ```
4. Restart PM2 cluster: `pm2 reload missive-api`.

### Playbook 2: Ollama Out of Memory (OOM)
1. Check kernel OOM killer logs:
   ```bash
   dmesg -T | grep -i oom
   ```
2. If Ollama was terminated due to memory pressure:
   - Configure a smaller model in `.env`: `OLLAMA_MODEL=qwen2.5:3b` or `qwen2.5:1.5b`.
   - Set `OLLAMA_NUM_PARALLEL=1` in `/etc/systemd/system/ollama.service.d/override.conf`.
   - Restart Ollama: `sudo systemctl restart ollama`.
