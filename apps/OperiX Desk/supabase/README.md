# Supabase setup

Apply the root migrations `20260813145000_operix_desk_legacy_schema.sql` and
`20260813150000_operix_desk_shared_workspace.sql` through the shared OperiX
Supabase migration workflow. They preserve the existing Desk tables while
adding shared Auth, organization scope, permissions, RLS, realtime, and the
database-level reservation conflict guard.

The backend uses the local Supabase Postgres service:

```env
DATABASE_URL=postgresql://postgres:postgres@supabase_db_OperiX:5432/postgres
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_INTERNAL_URL=http://supabase_kong_OperiX:8000
```

The frontend Supabase variables only configure the browser client. They do not replace `DATABASE_URL` for the FastAPI backend.

After setting `DATABASE_URL`, deploy or start the backend and check:

```text
/api/health
```

Expected response fields:

```json
{
  "database": "ok",
  "dialect": "postgresql"
}
```
