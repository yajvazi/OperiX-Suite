# OperiX hosted migration record

Date: **2026-08-12**  
Hosted project: **OperiX / `hprylepdcvakwngmoshy`**  
Region: **eu-central-1**  
Database: **PostgreSQL 17.6**

## Result

The hosted database migration completed successfully. The project was initially inactive, was restored, and reached `ACTIVE_HEALTHY` before schema deployment.

Remote migration history now contains 39 entries through:

`20260812150605_invoice_customer_signatures`

This includes the three official phase migrations:

- `20260812141314_phase_1_accounting_completion`
- `20260812143008_phase_2_tax_payroll_assets_inventory`
- `20260812144747_phase_3_reporting_mobile_compliance`

All prerequisite repository migrations between the original remote baseline and Phase 1 were applied chronologically. No hosted data was reset or deleted.

## Hosted smoke verification

- Companies: 3
- Existing invoices: 17
- Posted journals: 0
- Unbalanced posted journals: 0
- Failed financial reconciliation rows: 0
- Phase 1 accounting tables present: 6 checked, plus centralized VAT configuration tables
- Phase 2 operational tables present: 6 checked
- Phase 3 report/reconciliation views present: 11 checked
- EFS status: `EFS NOT CERTIFIED`

The existing hosted invoices are legacy/unposted records. They were not silently converted into accounting history. A controlled backfill and reconciliation review is still required.

## Remaining production blockers

Hosted Supabase advisors report unresolved security and performance findings, including missing RLS policies, mutable function search paths, anonymous SECURITY DEFINER execution, GraphQL exposure, unindexed foreign keys, multiple permissive policies and duplicate indexes. Kosovo legal verification and EFS certification also remain incomplete.

Therefore the migration is complete, but the production verdict remains **NO-GO**.
