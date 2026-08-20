#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."
docker compose config >/dev/null
docker compose ps
curl --fail --silent --show-error "http://127.0.0.1:${OPERIX_CRM_BIND_PORT:-3020}/healthz" >/dev/null
echo "OperiX CRM health check passed."
