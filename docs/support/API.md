# Support API reference

All routes except `/api/health` require a Supabase Auth session. The active company comes from the existing profile; an optional `x-company-id` header is accepted only when the user has permission in that company. JSON mutations use Zod schemas and return `{ data }` or `{ error: { code, message } }`.

| Method | Route | Permission | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Web health status. |
| GET | `/api/dashboard` | `support.dashboard.view` | Metrics and recent structured events. |
| GET | `/api/tickets` | `support.ticket.view` | Paginated tickets, filters, full-text-like global search. |
| POST | `/api/tickets` | `support.ticket.create` | Atomic ticket/conversation/initial message creation. |
| GET | `/api/tickets/:id` | `support.ticket.view` | Ticket graph: messages, events, attachments, tags. |
| PATCH | `/api/tickets/:id` | `support.ticket.update` | Subject, status, priority, category, department, contact. |
| POST | `/api/tickets/:id/assignment` | `support.ticket.assign` | Assign, reassign, or unassign. |
| POST | `/api/tickets/bulk-assignment` | `support.ticket.assign` | Atomically assign or unassign up to 200 tickets. |
| POST | `/api/tickets/:id/messages` | reply/internal-note permission | Add public reply or internal note; optionally queues SMTP delivery. |
| GET | `/api/agents` | `support.ticket.assign` | Existing users with Support ticket permission. |
| GET/POST | `/api/contacts` | contact view/manage | List or create generic contacts. |
| GET/PATCH | `/api/contacts/:id` | contact view/manage | Read or update a contact. |
| GET/POST | `/api/departments` | ticket view/department manage | List or create departments. |
| GET/POST | `/api/categories` | ticket view/category manage | List or create hierarchical categories. |
| GET/POST | `/api/tags` | ticket view/category manage | List or create color-coded searchable tags. |
| GET/POST | `/api/saved-replies` | ticket view/saved reply manage | Search/list or create saved replies. |
| GET/POST | `/api/filters` | ticket view | List or save personal/shared ticket filters. |
| POST | `/api/attachments` | `support.attachment.manage` | Validate, upload, checksum, and record an attachment. |
| GET | `/api/attachments/:id` | `support.ticket.view` | Short-lived signed download redirect. |
| GET/POST | `/api/mailboxes` | `support.email.manage` | List or create mailbox configurations. Secrets are never returned. |
| PATCH | `/api/mailboxes/:id` | `support.email.manage` | Update mailbox settings and encrypted credentials. |
| GET | `/api/email-deliveries` | `support.email.manage` | Delivery logs and retry state. |
| POST | `/api/email-deliveries/:id/resend` | `support.email.manage` | Requeue a failed/bounced delivery. |

## Search parameters

`GET /api/tickets` accepts `q`, `status`, `priority`, `departmentId`, `categoryId`, `tag`, `assignedToMe`, `page`, and `pageSize`. Search covers ticket number/subject and related contact/category/tag records while every query remains company-scoped.

## Error behavior

- `401` unauthenticated.
- `403` missing company or permission.
- `404` entity not found within the tenant.
- `400` Zod validation failure.
- `413` oversized attachment.
- `415` unsupported attachment MIME type.
- `409` resend or uniqueness conflict.
- `500` unexpected server/database failure, with details logged server-side only.
