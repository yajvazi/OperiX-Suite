# Safe QA fixtures

Fixtures must be created in a dedicated QA Supabase project or isolated local database. Use deterministic identifiers such as `qa-tenant-a`, `qa-tenant-b`, `qa-invoice-*`, and `qa-booking-*`; never use production customer records.

The fixture contract is:

- Tenant A and Tenant B have separate non-production users.
- Every generated row carries a QA marker or a deterministic namespace.
- Cleanup deletes only rows with that marker and only after the test run succeeds or is explicitly abandoned.
- If cleanup cannot be proved safe, use a disposable database or disposable tenants instead of deleting data from a shared project.
- Service-role access is restricted to the server-side fixture harness. It is never copied into a mobile app, bundled into an Expo build, or exposed in a test log.

The runner intentionally does not create accounts or mutate a backend until these variables and a safe harness are configured. This prevents an unattended run from touching production.
