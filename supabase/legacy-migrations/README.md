# Archived legacy SQL

These scripts were historically run manually and do not use Supabase's
timestamped migration contract. They are retained for audit/reference only;
they are not executed by `supabase db reset` or `supabase db push`.

The executable, additive foundation is
`supabase/migrations/20240101000000_legacy_schema_foundation.sql`. Later
timestamped migrations own the canonical RLS, domain, billing, and API
contracts.
