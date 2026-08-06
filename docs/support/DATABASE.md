# Database and migration summary

Migration: `supabase/migrations/20260806111345_operix_support_foundation.sql`

The migration is additive and creates:

- Reference/configuration: `support_departments`, `support_categories`, `support_tags`, `support_department_memberships`, `support_mailboxes`.
- Generic identity links: `support_contacts` with optional `linked_profile_id`, `linked_entity_type`, and `linked_entity_id`.
- Ticketing: `support_tickets`, `support_conversations`, `support_messages`, `support_attachments`, `support_ticket_tags`, `support_events`, `support_saved_replies`, `support_saved_filters`.
- Email/worker: `support_email_inbox_messages`, `support_mailbox_sync_state`, `support_email_deliveries`, `support_job_queue`.
- Automation foundation: `support_automation_rules`, `support_automation_actions`.
- Numbering: `support_ticket_global_number_seq`, `support_ticket_number_ledger`.

All support tables are tenant keyed and RLS-enabled. No `support_agents` or `support_customers` table exists. `support_contacts` is the only contact record and supports external customers, suppliers, leads, organizations, employees, linked profiles, and future application entities without duplicating identity.

The migration also adds Support permissions and system RBAC roles (`support_admin`, `support_manager`, `support_agent`, `support_viewer`, `support_customer`) to the existing `app_permissions`/`app_roles` model. Role assignment remains the existing OperiX RBAC responsibility.

The private storage bucket `operix-support-attachments` is created as non-public with a 25 MiB database default. The application limit is configurable through `SUPPORT_MAX_ATTACHMENT_BYTES` and should remain at or below the bucket limit unless infrastructure policy is intentionally changed.

Apply/review with the repository’s Supabase CLI workflow. The local lint command also reports pre-existing unrelated payroll issues in the current repository migration set; those are not changed by Support.
