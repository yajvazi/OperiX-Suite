# Invoice database: migration dry run (2026-10-28)

Production was only read (a read-only `pg_dump` and catalog queries). Everything below was run on
throwaway copies in isolated containers (same image as production, no network), which have been removed.

## Method
1. Copied the live database (schema and data, 69 MB) into a container.
2. Applied the 103 repo migrations that are not recorded in `supabase_migrations`, in order, each in its own transaction.
3. Built a second database from the repo migrations alone, on a clean Supabase base, and compared it with the copy of live (columns, functions, function bodies, policies).

Per-migration results: `migration-dryrun-2026-10-28.tsv`.

## Results
- Hosted database: 90 migrations recorded, newest `20260822230000`. Repo: 193, newest `20260825130000`.
- Of the 103 unrecorded migrations, 85 apply cleanly to a copy of live, 5 more after the fixes below, 13 cannot be applied a second time.
- **All 92 tables/views and 115 functions the web app references exist after the apply.** Missing on live today: `other_income*`, `operix_financial_account_*`, `integration_*`, `expense_payment_allocations`, `customer_refunds`, `customer_credit_balances`, and `record_customer_payment_financial`, `record_other_income`, `allocate_expense_payment`, `correct_expense_with_vat`, `repair_unposted_expenses`.
- From an empty Supabase base, 192 of 193 migrations apply (the one failure comes from an incomplete `auth` base copy in the test, not from the migration).

## Fixes made in this repo (none applied to production)
| File | Problem | Fix |
|---|---|---|
| `20260822180000_incoming_payments_other_income_finance.sql` | New constraint required every bank fund to have a bank account; one live fund is backed by a Stripe store, so the migration aborted | Constraint now allows a bank fund backed by a bank account or a Stripe store |
| `20260822193000_expenses_module_upgrade.sql` | Backfill of posted expenses blocked by the immutable-records guard and the assignment guard | Backfill runs with a transaction-local financial-workflow and service-role setting, cleared afterwards |
| `20260826090000_capture_untracked_live_schema.sql` (new) | Live has objects no migration creates | Captures them, idempotent: `companies.smtp_*`, `expenses.type`, `invoice_templates` display columns, `profiles.default_client_discount`, `vendors.bank_account`, `company_barazim_entries`, `handle_new_user` + `on_auth_user_created` trigger, `generate_company_invite_token`, `is_company_manager_or_higher` |

Without the capture migration a database built from the repo would have no profile row for new sign-ups and would break `expenses.type`.

## Drift that remains (not fixed)
- **Access control:** 26 function bodies differ between live and the repo, including `private.has_company_permission`, `private.can_grant_permission`, `private.rbac_canonical_permission`. Live also has 60 policies that no repo migration creates (for example "Users can view compliances for their company"). Policies are additive, so older leftovers can allow more than the repo intends. Cause: the RBAC migrations `20260824123000`, `20260824185000`, `20260824230000` and others could not be re-applied.
- 13 migrations are not safe to run twice (they stop at the first object that already exists, so they were applied by hand): `20260723070419`, `20260807120000`, `20260812143008`, `20260812154150`, `20260813190001`, `20260819133000` (`set_invoice_delivery_details` has overloads that make a call ambiguous), `20260821083855`, `20260824091934`, `20260824123000`, `20260824185000`, `20260824220000`, `20260824230000`, `20260825090000`. They need to be made idempotent or reconciled by hand before they can be tracked.
- Three data fix-up migrations for named people (`20260813100000`, `20260820250000`, `20260820260000`) only run with a service-role session. They are data changes, not schema: do not replay them on production.
- Legacy-foundation columns the live database lacks and no code uses: `clients.discount_type`, `profiles.city/country`, `vendor_payments.description`. `invoices.last_recurring_date` is `date` in the repo and `timestamptz` live.

## Security notes found on the way
- `companies.smtp_pass` stores SMTP passwords as plain text in a table the apps read.
- `generate_company_invite_token`, `handle_new_user`: `security definer` without a fixed `search_path`; execute is granted to `anon`.

## Proposed production rollout (not done; needs your approval)
1. Full `pg_dump` backup.
2. Apply the 85 + fixed migrations in order, in a transaction each, then re-run the comparison.
3. Make the 13 non-repeatable migrations idempotent, apply, and reconcile the RBAC policies and functions (the access-control drift above).
4. Record all versions in `supabase_migrations.schema_migrations`.
