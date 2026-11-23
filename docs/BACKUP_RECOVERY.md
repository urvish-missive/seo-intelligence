# Database Backup & Disaster Recovery Guide
## Missive Digital SEO Intelligence Platform

This document defines the operational procedures for backing up, verifying, and recovering the Missive Digital SEO Intelligence Platform database, encrypted credentials, generated reports, and client branding assets.

---

## 1. Backup Strategy & Scope

A complete disaster recovery backup of the platform consists of three distinct assets:

| Asset | Storage Location | Backup Mechanism | Recovery Criticality |
| :--- | :--- | :--- | :---: |
| **MySQL Relational Database** | MySQL Server (`missive_seo`) | `mysqldump` with `--single-transaction` | **CRITICAL** |
| **Master Encryption Key** | `/etc/missive/seo-intelligence.env` (`ENCRYPTION_KEY`) | Secure Key Vault / Offline Cold Storage | **MAXIMUM** |
| **Storage & Report Cache** | `/var/lib/missive-seo/reports` | Compressed TAR archive | **HIGH** |

> [!CAUTION]
> **The Encryption Key Dependency:**  
> All third-party access tokens and refresh tokens (Google Analytics 4, Google Search Console, Microsoft Clarity) are encrypted in the database using **AES-256-GCM** with `ENCRYPTION_KEY`.  
> **A restored database backup without the original `ENCRYPTION_KEY` cannot decrypt integration credentials.** Always preserve the encryption key in a separate, highly secure secret store.

---

## 2. Automated Scheduled Backups

The platform includes an automated backup utility at `scripts/backup.sh`.

### Crontab Schedule
Configure the daily automated backup on the database or application server (`crontab -e -u missive`):

```cron
# Run daily database and storage backup at 02:00 AM UTC
0 2 * * * /opt/missive-seo/scripts/backup.sh >> /var/log/missive-seo/backup.log 2>&1
```

### What `scripts/backup.sh` Performs:
1. Performs a transactional dump of the `missive_seo` database using `mysqldump --single-transaction --quick --routines --triggers`.
2. Compresses the dump into a gzip file: `db_missive_seo_YYYYMMDD_HHMMSS.sql.gz`.
3. Validates dump integrity immediately using `gzip -t`.
4. Creates a compressed archive of report PDFs, Excel files, and branding assets: `storage_YYYYMMDD_HHMMSS.tar.gz`.
5. Enforces a **30-day retention policy**, automatically purging archives older than 30 days.

---

## 3. Offsite Replication & Key Management

### Preserving the Master Encryption Key
1. **Never store the `ENCRYPTION_KEY` in the same backup archive as the database dump.**
2. Store `ENCRYPTION_KEY` in your agency's enterprise secret manager:
   - AWS Secrets Manager / GCP Secret Manager
   - HashiCorp Vault
   - 1Password / Bitwarden Enterprise Vault
3. Document key metadata: Date issued, associated environment (Staging vs Production).

### Offsite S3 / GCS Replication
To replicate daily backups to an encrypted AWS S3 bucket:

```bash
# Add to scripts/backup.sh post-backup hook:
aws s3 sync /var/backups/missive-seo/ s3://missive-seo-backups-vault/$(date +"%Y/%m")/ \
  --sse aws:kms \
  --sse-kms-key-id alias/missive-backup-key
```

---

## 4. Full System Restoration Procedure

In the event of database corruption, hardware failure, or data loss:

### Step 1: Pre-Restoration Verification
1. Confirm the target server has MySQL 8.0 installed and running.
2. Confirm the active `/etc/missive/seo-intelligence.env` has the **identical `ENCRYPTION_KEY`** that was active when the backup was generated.
3. Stop web API and background worker processes to prevent concurrent writes:
   ```bash
   pm2 stop ecosystem.config.cjs
   ```

### Step 2: Execute Restoration Script
Run `scripts/restore.sh` providing the database archive and optional storage archive:

```bash
cd /opt/missive-seo
chmod +x scripts/restore.sh

export DB_PASSWORD="YOUR_PROD_DB_PASSWORD"
./scripts/restore.sh /var/backups/missive-seo/db_missive_seo_20261123_020000.sql.gz \
                     /var/backups/missive-seo/storage_20261123_020000.tar.gz
```

Type `RESTORE` when prompted. The script will:
- Test archive integrity via `gzip -t`.
- Stream and execute SQL statements into MySQL.
- Extract file assets into `/var/lib/missive-seo/reports`.

### Step 3: Run Prisma Migration Check
Ensure all database migrations match the current codebase:

```bash
cd /opt/missive-seo/backend
npx prisma migrate deploy
```

### Step 4: Restart Services & Verify Integrity
```bash
pm2 start ecosystem.config.cjs
curl -s http://localhost:5000/api/v1/health/detailed | jq .
```

---

## 5. Migration Rollback Strategy

Prisma uses forward-only migrations. When a migration needs to be rolled back:

### Scenario A: Migration failed during `prisma migrate deploy`
1. Inspect the migration error in the deployment log.
2. Fix the underlying schema constraint or SQL statement in `prisma/migrations/`.
3. Resolve the migration state in Prisma:
   ```bash
   npx prisma migrate resolve --rolled-back <MIGRATION_NAME>
   ```
4. Re-apply:
   ```bash
   npx prisma migrate deploy
   ```

### Scenario B: Emergency Rollback of Applied Migration
1. Revert to the previous application git release:
   ```bash
   git checkout <PREVIOUS_STABLE_TAG>
   ```
2. Generate a compensating rollback SQL script or restore from the pre-deployment snapshot created immediately prior to the deployment.

---

## 6. Disaster Recovery Verification Runbook

Perform a disaster recovery dry run quarterly:
1. Spin up a temporary sandbox instance or Docker container.
2. Apply the latest backup using `scripts/restore.sh`.
3. Launch the backend API pointing to the restored database.
4. Run integration tests:
   ```bash
   npm test -- tests/integration/security-audit.test.js
   ```
5. Decrypt a sample integration credential using the `EncryptionService` to verify that `ENCRYPTION_KEY` successfully decrypts stored tokens.
