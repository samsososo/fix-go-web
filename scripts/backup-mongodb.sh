#!/usr/bin/env bash

set -euo pipefail

BACKUP_DIR="${HOTFIX_MONGODB_BACKUP_DIR:-/root/hotfix24-mongodb/backups}"
RETENTION_DAYS="${HOTFIX_MONGODB_BACKUP_RETENTION_DAYS:-7}"
CONTAINER_NAME="${HOTFIX_MONGODB_CONTAINER:-hotfix24-mongo}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOCK_FILE="${HOTFIX_MONGODB_BACKUP_LOCK:-/run/lock/hotfix24-mongodb-backup.lock}"

install -d -m 700 "$BACKUP_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

dump_database() {
  local database="$1"
  local destination="$BACKUP_DIR/${database}-${TIMESTAMP}.archive.gz"

  docker exec "$CONTAINER_NAME" sh -c '
    exec mongodump \
      --quiet \
      --host 127.0.0.1 \
      --username "$MONGO_INITDB_ROOT_USERNAME" \
      --password "$MONGO_INITDB_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --db "$1" \
      --archive \
      --gzip
  ' sh "$database" >"$destination"

  test -s "$destination"
  chmod 600 "$destination"
}

dump_database hotfix_dev
dump_database hotfix_prod

find "$BACKUP_DIR" -type f -name 'hotfix_*.archive.gz' -mtime "+$RETENTION_DAYS" -delete
