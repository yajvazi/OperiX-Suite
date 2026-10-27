#!/usr/bin/env bash
# Builds the hosted web image from the generated (isolated) tree.
#   scripts/oss/build-web-image.sh            # tags operix-invoice-web:latest
#   IMAGE=operix-invoice-web:test scripts/oss/build-web-image.sh
# The hosted env file (apps/OperiX Invoice/OperiX Web/.env.production) is copied into the
# build tree only; it is never committed or published.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTEXT="${WEB_BUILD_CONTEXT:-/root/operix-web-build}"
IMAGE="${IMAGE:-operix-invoice-web:latest}"
APP="apps/OperiX Invoice/OperiX Web"

node "$ROOT/scripts/oss/export-web.mjs" --out "$CONTEXT" --force
cp "$ROOT/$APP/.env.production" "$CONTEXT/$APP/.env.production"
docker build -f "$CONTEXT/$APP/Dockerfile" -t "$IMAGE" "$CONTEXT"
echo "Built $IMAGE from $CONTEXT"
