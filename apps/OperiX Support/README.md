# OperiX Support

Standalone OperiX Support application for `helpdesk.operixsuite.com`.

The app uses the existing Supabase Auth, company, membership, profile, and RBAC tables. It intentionally does not create support agent or customer identity tables. A support agent is an authenticated user with a Support permission; `support_contacts` is the generic contact abstraction for external and internal entities.

Run locally from the repository root:

```bash
npm install
npm run dev --workspace operix-support
npm run worker:dev --workspace operix-support
```

The web service listens on port `3010` by default. The worker is a separate process and requires the Supabase service-role key, storage bucket, and credential encryption key.
