#!/bin/bash
# Billing maintenance, every 15 minutes: expires finished trials, processes the subscription sync queue with Stripe,
# and applies plan changes that were scheduled for a later date. Install:
#   install -m 700 scripts/ops/billing-sync-cron.sh /usr/local/bin/operix-billing-sync.sh
#   (crontab -l 2>/dev/null; echo '*/15 * * * * /usr/local/bin/operix-billing-sync.sh') | crontab -
# The secret is read from the web app's env file when the job runs, so it never appears in the crontab.
ENV_FILE="${OPERIX_WEB_ENV:-/root/OperiX/apps/OperiX Invoice/OperiX Web/.env.production}"
URL="${OPERIX_WEB_LOCAL_URL:-http://127.0.0.1:3006}/api/cron/billing-sync"
LOG=/var/log/operix-billing-sync.log
SECRET=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[ -n "$SECRET" ] || exit 0
OUT=$(mktemp)
CODE=$(curl -s -m 120 -o "$OUT" -w '%{http_code}' "$URL" -H "authorization: Bearer $SECRET")
echo "$(date -u +%FT%TZ) http=$CODE $(head -c 300 "$OUT")" >> "$LOG"
rm -f "$OUT"
# Keep the log small: only the last 500 lines.
tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 0
