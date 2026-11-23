#!/bin/bash
# scripts/backup.sh
# Production Backup Script for Missive SEO Intelligence Platform.
# Backs up MySQL database, generated reports, uploaded assets, and verifies integrity.

set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_PATH:-/var/backups/missive-seo}"
REPORT_DIR="${FILE_STORAGE_PATH:-/var/lib/missive-seo/reports}"
LOG_DIR="${LOG_PATH:-/var/log/missive-seo}"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-missive_app}"
DB_NAME="${DB_NAME:-missive_seo}"

mkdir -p "$BACKUP_DIR"

echo "==========================================================="
echo "  Starting Missive SEO Intelligence Platform Backup"
echo "  Timestamp: $TIMESTAMP"
echo "==========================================================="

# ─── 1. MySQL Database Backup ───────────────────────────────────────
DB_DUMP_FILE="${BACKUP_DIR}/db_${DB_NAME}_${TIMESTAMP}.sql.gz"
echo "[1/4] Dumping MySQL database '${DB_NAME}'..."

if [ -z "${DB_PASSWORD:-}" ]; then
  echo "ERROR: DB_PASSWORD environment variable is required."
  exit 1
fi

MYSQL_PWD="$DB_PASSWORD" mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --default-character-set=utf8mb4 \
  "$DB_NAME" | gzip > "$DB_DUMP_FILE"

# Verify gzip integrity
echo "[2/4] Verifying database dump integrity..."
gzip -t "$DB_DUMP_FILE"
DB_SIZE=$(du -h "$DB_DUMP_FILE" | cut -f1)
echo "      Database dump verified successfully. Size: $DB_SIZE"

# ─── 2. Storage & Report Files Backup ───────────────────────────────
STORAGE_TAR_FILE="${BACKUP_DIR}/storage_${TIMESTAMP}.tar.gz"
echo "[3/4] Archiving report and branding files from '${REPORT_DIR}'..."

if [ -d "$REPORT_DIR" ]; then
  tar -czf "$STORAGE_TAR_FILE" -C "$(dirname "$REPORT_DIR")" "$(basename "$REPORT_DIR")"
  tar -tzf "$STORAGE_TAR_FILE" > /dev/null
  STORAGE_SIZE=$(du -h "$STORAGE_TAR_FILE" | cut -f1)
  echo "      Storage archive verified successfully. Size: $STORAGE_SIZE"
else
  echo "      Warning: Storage directory '$REPORT_DIR' not found. Skipping file archive."
fi

# ─── 3. Retention Cleanup (Default: 30 days) ────────────────────────
echo "[4/4] Applying 30-day retention cleanup policy..."
find "$BACKUP_DIR" -type f -name "db_*.sql.gz" -mtime +30 -delete
find "$BACKUP_DIR" -type f -name "storage_*.tar.gz" -mtime +30 -delete

echo "==========================================================="
echo "  Backup completed successfully!"
echo "  DB File:      $DB_DUMP_FILE"
echo "  Storage File: $STORAGE_TAR_FILE"
echo "  IMPORTANT:    Ensure ENCRYPTION_KEY is securely preserved."
echo "==========================================================="
