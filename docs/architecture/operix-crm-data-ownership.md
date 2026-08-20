# OperiX CRM data ownership

| Entity/domain | Source of truth | What OperiX CRM stores |
| --- | --- | --- |
| Leads and opportunities | OperiX CRM | Full CRM record and activity history |
| Sales activities, tasks, notes | OperiX CRM | Full CRM activity record |
| Relationship/company context | OperiX CRM | Full relationship context plus links |
| Legal billing identity | OperiX Invoice | Reference and approved summary fields only |
| Invoices, payments, accounting | OperiX Invoice | Link/reference only in CRM |
| Employees and payroll | OperiX HR | Reference only |
| Reservations and desk bookings | OperiX Booking/Desk | Reference only |

Future custom CRM objects such as Quotes, Invoice References, Subscriptions,
Bookings, Support Cases, Contracts, Branches, Resellers, and Service Packages
must contain references and summaries rather than copied accounting, payroll,
booking, or desk data.

## Field ownership

- CRM-owned: opportunity stage, lead status, CRM owner, sales notes,
  relationship status, next activity, and pipeline values.
- Invoice-owned: tax identifiers, billing address, payment terms, legal name
  used for documents, invoice status, payment status, and accounting values.
- Shared: display name, primary email, phone, website, city, and country.

Conflicts are surfaced as integration events/audit records. A sync job must
never silently overwrite an owner-controlled field.
