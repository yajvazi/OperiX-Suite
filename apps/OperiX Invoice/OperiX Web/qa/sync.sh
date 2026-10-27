#!/usr/bin/env bash
# Copies the private repo's web app source and shared packages into the QA tree (dev server hot-reloads).
set -euo pipefail
SRC="${SRC:-/root/OperiX}"; DST="${DST:-/root/operix-qa}"
APP="apps/OperiX Invoice/OperiX Web"
tar -c -C "$SRC" --exclude=node_modules --exclude=.next --exclude='qa/out' "$APP/src" "$APP/qa" "$APP/next.config.ts" "$APP/package.json" \
  packages/operix-ui packages/app-shell packages/api packages/types packages/invoice-template packages/money packages/commercial-documents packages/report-templates packages/billing packages/accounting packages/payroll packages/public-api 2>/dev/null | tar -x -C "$DST"
echo "synced"
