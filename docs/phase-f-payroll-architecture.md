# OperiX Invoice payroll architecture

## Invariant

`period -> snapshots -> deterministic calculation -> approval -> finalization
-> balanced journal -> liabilities -> payslips -> payment batch -> bank journal
-> reconciliation -> audit/outbox`

Finalization is a single database transaction. It locks inputs, freezes results,
creates checksum-addressed payslip snapshots, creates liabilities, resolves
effective posting mappings, posts a balanced Phase B journal, and records audit
and outbox events. A journal failure aborts the entire finalization.

## Calculation boundary

`packages/payroll` is pure and does not access Supabase. Money is converted to
integer atoms by the monorepo money package. The engine accepts one explicit
configuration version and emits rule references, warnings, errors, and
iteration metadata. Net-to-gross uses bounded deterministic binary search.

No tax bracket, pension rate, or legal threshold is embedded in the database
commands or UI. An approved configuration requires effective dates and a source
reference. A finalized run stores the exact configuration ID and snapshots.

## HR boundary

OperiX HR may provide approved attendance, leave, overtime, employee, or
contract changes. OperiX Invoice validates company ownership and stores an
immutable payload, source application, source record IDs, approval status,
import time, configuration version, and checksum. Historical payroll and
payslips never query mutable live attendance.

## Security

RLS is enabled on every payroll table. Payroll permissions are separate from
general HR roles. Employee payslip access compares the authenticated user to the
canonical employee `user_id`; authorized payroll users use explicit sensitive
permissions. Every view/download is logged. Employee bank data is held in a
restricted table and generic exports are generated only from approved batches.

All risky feature flags are off for existing companies. Payroll, Kosovo rules,
accounting, bank export, portals, imports, and supplemental runs are enabled
independently.

## Corrections

Finalized rows, input snapshots, calculation lines, liabilities, and payslip
snapshots are immutable. Corrections use a supplemental run or
`reverse_payroll_run`, require permissions and reasons, reference the original,
and create separate reversal journals and audit links.

## Compliance boundary

This is a fiscal-ready accounting implementation, not a legal certification.
Kosovo configuration must be validated by an accountant and legal reviewer.
No TAK endpoint or statutory file format is implemented without an official,
current specification.
