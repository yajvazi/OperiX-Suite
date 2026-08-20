#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."
BACKUP_ROOT="${OPERIX_CRM_BACKUP_DIR:-$PWD/backup}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"
chmod 700 "$DEST"

docker compose exec -T db pg_dump --format=custom --no-owner --no-privileges \
  -U "${PG_DATABASE_USER:?Set PG_DATABASE_USER in .env}" \
  -d "${PG_DATABASE_NAME:-twenty}" > "$DEST/twenty-postgres.dump"

docker run --rm \
  -v operix-crm-server-local-data:/source:ro \
  -v "$DEST":/backup \
  alpine:3.21 tar -czf /backup/twenty-local-storage.tar.gz -C /source .

cp .env.example "$DEST/env-reference.example"
printf '%s\n' "Backup created at $DEST"
