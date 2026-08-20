#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."
SOURCE_DIR="${1:?Usage: restore.sh /absolute/path/to/backup-directory}"
test -f "$SOURCE_DIR/twenty-postgres.dump"
test -f "$SOURCE_DIR/twenty-local-storage.tar.gz"
echo "This restores only the isolated OperiX CRM volumes. Verify the target and backup before continuing."
read -r -p "Type RESTORE-OPERIX-CRM to continue: " confirmation
test "$confirmation" = "RESTORE-OPERIX-CRM"

docker compose stop server worker
docker compose start db redis
docker compose exec -T db pg_isready -U "${PG_DATABASE_USER:?Set PG_DATABASE_USER in .env}" -d "${PG_DATABASE_NAME:-twenty}" >/dev/null
docker compose exec -T db dropdb --if-exists -U "${PG_DATABASE_USER:?Set PG_DATABASE_USER in .env}" "${PG_DATABASE_NAME:-twenty}"
docker compose exec -T db createdb -U "${PG_DATABASE_USER:?Set PG_DATABASE_USER in .env}" "${PG_DATABASE_NAME:-twenty}"
docker compose exec -T db pg_restore --clean --if-exists --no-owner --no-privileges \
  -U "${PG_DATABASE_USER:?Set PG_DATABASE_USER in .env}" \
  -d "${PG_DATABASE_NAME:-twenty}" < "$SOURCE_DIR/twenty-postgres.dump"

docker run --rm \
  -v operix-crm-server-local-data:/target \
  -v "$SOURCE_DIR":/backup:ro \
  alpine:3.21 sh -c 'find /target -mindepth 1 -delete && tar -xzf /backup/twenty-local-storage.tar.gz -C /target'

docker compose up -d
./scripts/healthcheck.sh
echo "Restore completed. Reconcile integration events before enabling CRM sync."
