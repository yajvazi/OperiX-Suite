# OperiX Desk Local Supabase Setup

OperiX Desk runs as two Docker Compose services against the local OperiX
Supabase stack:

- The frontend serves the browser client on `http://127.0.0.1:54321`.
- The backend reaches Supabase through the Docker network alias
  `supabase_kong_OperiX` and its Postgres service through
  `supabase_db_OperiX`.
- Uploaded floor plans and profile images persist in the `operixdesk_backend-uploads` Docker volume.

## Required environment

Keep production values in `apps/OperiX Desk/.env` on the VPS. Do not commit it or expose service credentials to the web or mobile clients.

```env
DATABASE_URL=postgresql://postgres:postgres@supabase_db_OperiX:5432/postgres
SECRET_KEY=long-random-server-only-secret
FRONTEND_BASE_URL=http://127.0.0.1:3007
CORS_ORIGINS=http://127.0.0.1:3007,http://127.0.0.1:5173
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_INTERNAL_URL=http://supabase_kong_OperiX:8000
SUPABASE_PUBLISHABLE_KEY=the-same-shared-publishable-key-used-by-OperiX
SHARED_AUTH_ENABLED=true
LEGACY_AUTH_ENABLED=false
ALLOW_LEGACY_UNSCOPED_DATA=false
```

The frontend `.env` contains only public Vite configuration (`VITE_SUPABASE_URL` and the publishable key). Never use a Supabase service-role key there.

## Database safety

Before a schema change:

1. Take a Postgres backup.
2. Apply `20260813145000_operix_desk_legacy_schema.sql`.
3. Apply `20260813150000_operix_desk_shared_workspace.sql`.
4. Verify users, resources, reservations, floor plans, company ids, and RLS state.

The Desk migration is additive and retains the legacy integer ids so reservation ownership can be mapped to shared Supabase Auth users without deleting data. Do not reset the shared database.

## Deploy and verify

```bash
cd "/root/OperiX/apps/OperiX Desk"
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8002/api/health
curl -fsSI http://127.0.0.1:3007/
```

The host Nginx vhost is `/etc/nginx/sites-available/desk.operixsuite.com`. After changing it, run `nginx -t` and reload Nginx. Keep the application ports bound to loopback; only Nginx should be public.

## Operations

- `docker compose logs -f backend` shows API startup and database errors.
- `docker compose logs -f frontend` shows the static Nginx container.
- Keep `docker compose down` out of routine local restarts; `up -d --build` recreates only the Desk services.
- Shared account sign-in is handled by Supabase Auth; legacy Desk passwords remain disabled in production.
