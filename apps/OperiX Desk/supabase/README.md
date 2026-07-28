# Supabase setup

Run `supabase/migrations/20260622120000_create_deskdibs_schema.sql` in the Supabase SQL Editor before pointing the backend at Supabase.

The app still needs the backend Postgres connection string:

```env
DATABASE_URL=postgresql://postgres.gxmbwmbvdfvpdbtqybcl:YOUR_URL_ENCODED_DB_PASSWORD@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
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
