#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."
NEW_TAG="${1:?Usage: upgrade.sh vX.Y.Z}"
case "$NEW_TAG" in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "Version must be an exact tag such as v2.8.5" >&2; exit 2 ;;
esac

./scripts/backup.sh
TWENTY_TAG="$NEW_TAG" docker compose config >/dev/null
sed -i.bak "s/^TWENTY_TAG=.*/TWENTY_TAG=$NEW_TAG/" .env
docker compose pull server worker
docker compose up -d
./scripts/healthcheck.sh
rm -f .env.bak
echo "Upgrade completed for $NEW_TAG. Validate CRM login, API, webhooks, and links before production sign-off."
