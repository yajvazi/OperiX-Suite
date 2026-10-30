#!/bin/bash
# Safety net for push notifications: every few minutes, ask the web app to send anything the database queued but the
# instant call missed (for example during a restart). Install:
#   install -m 700 scripts/ops/push-dispatch-cron.sh /usr/local/bin/operix-push-dispatch.sh
#   (crontab -l 2>/dev/null; echo '*/5 * * * * /usr/local/bin/operix-push-dispatch.sh') | crontab -
# The secret is read from the web app's env file when the job runs, so it never appears in the crontab.
ENV_FILE="${OPERIX_WEB_ENV:-/root/OperiX/apps/OperiX Invoice/OperiX Web/.env.production}"
URL="${OPERIX_WEB_LOCAL_URL:-http://127.0.0.1:3006}/api/internal/push-dispatch"
LOG=/var/log/operix-push-dispatch.log
SECRET=$(grep -E '^PUSH_DISPATCH_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[ -n "$SECRET" ] || SECRET=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[ -n "$SECRET" ] || exit 0
OUT=$(mktemp)
CODE=$(curl -s -m 30 -o "$OUT" -w '%{http_code}' -X POST "$URL" -H "x-dispatch-secret: $SECRET")
# Only log when something happened or went wrong, so the log stays small.
if [ "$CODE" != "200" ] || ! grep -q '"events":0' "$OUT"; then
  echo "$(date -u +%FT%TZ) http=$CODE $(head -c 200 "$OUT")" >> "$LOG"
fi
rm -f "$OUT"
exit 0
