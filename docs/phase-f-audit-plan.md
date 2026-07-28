# OperiX Invoice Phase F audit and implementation plan

## Ownership and reuse

OperiX Invoice owns calculation, approval, finalization, accounting, payslips,
payment batches, reconciliation, and payroll exports. The existing `employees`
table remains the canonical employee identity. OperiX HR attendance, leave,
overtime, and contract records are optional approved input sources; imported
values are copied into immutable payroll input snapshots.

The implementation reuses:

- Phase A tenant membership, branches, permissions, feature flags, audit events,
  and outbox events.
- Phase B accounting periods, chart of accounts, dimensions, journal entries,
  journal lines, balancing, immutability, and reversal commands.
- Phase C company bank accounts and journal-backed bank-payment workflow.
- Existing OperiX Invoice authentication, app shell, document rendering,
  Supabase client conventions, and responsive design system.

The legacy OperiX HR `payrolls` flow remains accessible for compatibility, but
is not used for Phase F calculations or accounting because it mutates salary
data client-side and is not an immutable ledger.

## Requirements matrix

| Area | Audit status | Phase F result |
| --- | --- | --- |
| Canonical employees | Partial | Existing identity extended with payroll readiness and dimensions |
| Effective compensation | Missing | Versioned profiles and history |
| Tax/pension rules | Missing | Effective approved configuration with source references |
| Deterministic engine | Missing | Pure decimal package with gross/net, proration, earnings and deductions |
| HR inputs | Partial | Explicit immutable import snapshots with source IDs and checksums |
| Runs and approvals | Missing | Transactional state machine and segregation-ready approvals |
| Accounting | Foundation complete | Phase B journal mappings and atomic finalization |
| Payslips | Missing | Immutable bilingual snapshots with access logging and PDF/HTML delivery |
| Payments | Partial | Phase C bank accounts reused by traceable batches and payment journals |
| Mobile | Partial | Read-only administrator and own-payslip surface |
| Historical data | Requires review | Classification only; no fabricated payroll |
| Kosovo legal rules | Requires compliance review | No default rates; approval and source reference required |
| TAK exports | Requires official specification | Versioned provider architecture only |

## Delivery order

1. Add feature flags, permissions, canonical employee extensions, effective
   rule/configuration tables, run tables, immutable snapshots, liabilities,
   batches, exports, RLS, and migration classifications.
2. Add deterministic `packages/payroll` calculations and tests.
3. Add authenticated transactional commands and immutable audit/outbox writes.
4. Add OperiX Invoice routes, payroll navigation, review, approval, adjustment,
   payslip, payment, reporting, and configuration interfaces.
5. Add mobile owner/employee visibility.
6. Parse and test migrations, run package/web checks, back up the database,
   apply migrations, rebuild, health-check, and release with flags off.

## Rollback

Migrations are additive. Existing employee, invoice, HR, and accounting records
are not rewritten. Before deployment, take a PostgreSQL custom-format backup.
Rollback of application code uses the previous Git commit/container image.
Database rollback uses the backup; tables must not be dropped on a live system
without confirming no Phase F records were created.
