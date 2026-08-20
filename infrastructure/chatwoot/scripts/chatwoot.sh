#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${STACK_DIR}/.env"
COMPOSE_FILE="${STACK_DIR}/docker-compose.yml"

compose() {
  docker compose \
    --project-name operix-chatwoot \
    --env-file "${ENV_FILE}" \
    --file "${COMPOSE_FILE}" \
    "$@"
}

require_docker() {
  command -v docker >/dev/null 2>&1 || {
    echo "Docker is required." >&2
    exit 1
  }
  docker compose version >/dev/null 2>&1 || {
    echo "Docker Compose v2 is required." >&2
    exit 1
  }
}

init() {
  if [[ -f "${ENV_FILE}" ]]; then
    return
  fi

  umask 077
  cp "${STACK_DIR}/.env.example" "${ENV_FILE}"
  sed -i \
    -e "s|__GENERATE_SECRET_KEY_BASE__|$(openssl rand -hex 64)|" \
    -e "s|__GENERATE_REDIS_PASSWORD__|$(openssl rand -hex 32)|" \
    -e "s|__GENERATE_POSTGRES_PASSWORD__|$(openssl rand -hex 32)|" \
    "${ENV_FILE}"
  echo "Created ${ENV_FILE} with fresh local secrets."
}

ensure_env() {
  init
  [[ -s "${ENV_FILE}" ]] || {
    echo "Chatwoot environment file is empty: ${ENV_FILE}" >&2
    exit 1
  }
}

usage() {
  cat <<'EOF'
Usage: ./scripts/chatwoot.sh <command>

Commands:
  init      Create .env with generated local secrets
  up        Pull images, prepare the database, and start Chatwoot
  prepare   Run Chatwoot database migrations
  upgrade   Pull the configured image, migrate, and restart Chatwoot
  down      Stop the Chatwoot stack without deleting volumes
  restart   Restart the Rails and Sidekiq services
  status    Show service status
  logs      Follow recent service logs
  config    Render and validate the Compose configuration
EOF
}

require_docker

case "${1:-}" in
  init)
    init
    ;;
  up)
    ensure_env
    compose pull
    compose run --rm rails bundle exec rails db:chatwoot_prepare
    compose up -d
    compose ps
    ;;
  prepare)
    ensure_env
    compose run --rm rails bundle exec rails db:chatwoot_prepare
    ;;
  upgrade)
    ensure_env
    compose pull
    compose run --rm rails bundle exec rails db:chatwoot_prepare
    compose up -d
    compose ps
    ;;
  down)
    if [[ -f "${ENV_FILE}" ]]; then
      compose down
    else
      docker compose --project-name operix-chatwoot --file "${COMPOSE_FILE}" down
    fi
    ;;
  restart)
    ensure_env
    compose restart rails sidekiq
    ;;
  status)
    ensure_env
    compose ps
    ;;
  logs)
    ensure_env
    compose logs --follow --tail=200 "${@:2}"
    ;;
  config)
    ensure_env
    compose config
    ;;
  *)
    usage
    exit 1
    ;;
esac
