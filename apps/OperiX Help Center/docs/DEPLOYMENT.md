# OperiX Help Center deployment runbook

The production service is `operix-help-center`. It runs as a standalone Next.js container bound only to `127.0.0.1:3042` and is exposed through the existing Nginx server block for `helpdesk.operixsuite.com`.

## Build and run

From the monorepo root:

```bash
docker compose -f docker-compose.help-center.yml up -d --build
docker ps --filter name=operix-help-center
curl -fsS http://127.0.0.1:3042/api/health
```

The compose file intentionally does not use `--remove-orphans`; the VPS has other Compose projects and shared Supabase containers that must remain untouched.

## Environment

- `NEXT_PUBLIC_SITE_URL` — canonical public origin.
- `NEXT_PUBLIC_SUPPORT_URL` — optional configured support destination.
- `INDEXING_ALLOWED` — production build flag for sitemap and robots. Use `false` for staging.
- `PREVIEW_DRAFTS` and `PREVIEW_AUTHORIZED` — both must be `true` for a private draft preview build. Never expose that build publicly.

`INDEXING_ALLOWED` and `NEXT_PUBLIC_SITE_URL` are passed as Docker build arguments because the sitemap and robots routes are statically generated.

## Nginx cutover

Before changing the upstream, save the current server block under the approved backup directory. Validate the replacement first, then update only the `proxy_pass` line in `/etc/nginx/sites-available/helpdesk.operixsuite.com`:

```nginx
proxy_pass http://127.0.0.1:3042;
```

Validate and reload without restarting unrelated services:

```bash
nginx -t
systemctl reload nginx
```

Keep the existing certificate, Cloudflare-compatible proxy headers, real-IP handling, ACME path, and shared security-header include intact.

## Verification

Check the internal health endpoint, the public HTTPS health endpoint, the homepage, one English article, one Albanian route, search, API docs, FAQs, and a legacy redirect. Run the browser suite against both the internal port and the public hostname:

```bash
E2E_BASE_URL=http://127.0.0.1:3042 npm run test:e2e --workspace=operix-help-center
E2E_BASE_URL=https://helpdesk.operixsuite.com npm run test:e2e --workspace=operix-help-center
```

Also check `docker logs --since 15m operix-help-center` and the Nginx error log for new Help Center upstream failures.

## Retiring the former helpdesk

The former deployment used `operix-support-web` on port `3030` and `operix-support-worker` on port `3031`. Remove those exact containers and their obsolete image only after the public checks pass. Do not remove the shared Supabase database, support tables, migrations, mail infrastructure, or unrelated images and volumes. The retired source/configuration is archived under the server backup directory before removal.
