#!/bin/bash
# scripts/restore.sh
# Database and Storage Restoration Script for Missive SEO Intelligence Platform.

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path-to-db-backup.sql.gz> [path-to-storage-archive.tar.gz]"
  echo "Example: $0 /var/backups/missive-seo/db_missive_seo_20261123_120000.sql.gz"
  exit 1
fi

DB_BACKUP_FILE="$1"
STORAGE_BACKUP_FILE="${2:-}"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-missive_app}"
DB_NAME="${DB_NAME:-missive_seo}"
REPORT_DIR="${FILE_STORAGE_PATH:-/var/lib/missive-seo/reports}"

if [ ! -f "$DB_BACKUP_FILE" ]; then
  echo "ERROR: Backup file '$DB_BACKUP_FILE' does not exist."
  exit 1
fi

if [ -z "${DB_PASSWORD:-}" ]; then
  echo "ERROR: DB_PASSWORD environment variable is required."
  exit 1
fi

echo "==========================================================="
echo "  WARNING: RESTORATION OVERWRITES CURRENT DATABASE DATA!"
echo "  Target Database: $DB_NAME on $DB_HOST:$DB_PORT"
echo "  Source Backup:   $DB_BACKUP_FILE"
echo "==========================================================="
read -p "Type 'RESTORE' to proceed: " CONFIRM

if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Restoration aborted by operator."
  exit 0
fi

# ─── 1. Verify and Restore Database ─────────────────────────────────
echo "[1/2] Verifying backup integrity before restoring..."
gzip -t "$DB_BACKUP_FILE"

echo "      Restoring MySQL database '$DB_NAME'..."
gunzip < "$DB_BACKUP_FILE" | MYSQL_PWD="$DB_PASSWORD" mysql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --default-character-set=utf8mb4 \
  "$DB_NAME"

echo "      Database restored successfully."

# ─── 2. Restore Storage / Reports ───────────────────────────────────
if [ -n "$STORAGE_BACKUP_FILE" ] && [ -f "$STORAGE_BACKUP_FILE" ]; then
  echo "[2/2] Restoring storage files from '$STORAGE_BACKUP_FILE'..."
  mkdir -p "$(dirname "$REPORT_DIR")"
  tar -xzf "$STORAGE_BACKUP_FILE" -C "$(dirname "$REPORT_DIR")"
  echo "      Storage files restored successfully."
else
  echo "[2/2] No storage archive provided. Skipping file restoration."
fi

echo "==========================================================="
echo "  Restoration completed!"
echo "  Verify that the application's current ENCRYPTION_KEY"
echo "  matches the key used when this backup was taken."
echo "==========================================================="
