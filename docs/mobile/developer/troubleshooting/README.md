---
title: Developer troubleshooting
description: Diagnose navigation, Supabase, build, PDF, localization, permissions, and integration failures.
category: developer
language: en
keywords:
  - debugging
  - Supabase error
  - build error
  - route error
  - RLS error
---

# Developer troubleshooting

## Route does not open

Check the route in `navigation/types.ts`, its registration in `AppNavigator.tsx`, nested navigator params, and whether a legacy route is being selected. Run the navigation test and inspect the console for invalid nested params.

## Supabase query is empty

Log only safe identifiers. Check `getWorkspaceScope`, active company, descendant IDs, `scopedResource`, the table’s RLS policy, and whether the row has `company_id` or only legacy `user_id`. Test the query with an authenticated user in the Supabase dashboard without bypassing policies.

## RPC fails with permission/constraint error

Read the latest migration for the function, permission code, idempotency key, document status, accounting state, and required company fields. Do not “fix” a permission error by switching to a direct table insert for a financial event.

## Duplicate or uncertain financial result

Search by idempotency key/document ID before retrying. Payment posting and allocation are separate. Commercial conversion creates a new document and relation; inspect `document_source_links`.

## Typecheck/localization fails

Run typecheck from the mobile directory, inspect the first error, and keep translation keys typed in both locales. Current known baseline issues are recorded in [Known limitations](../../KNOWN-LIMITATIONS.md).

## PDF is different from preview

Compare `InvoiceDetailScreen`, `TemplateFactory`, `pdfService`, shared `invoice-template`, and template config. Test corporate versus thermal/page-size conditions and platform print margins.

## Stripe/OAuth fails

Check redirect URI/scheme configuration, Supabase Edge Function response, session validity, and account connection status. Do not print OAuth tokens or API keys. Prefer the Edge Function path over direct API-key mode.

## Cross-tenant data appears

Treat this as a release-blocking security defect. Reproduce with two companies, inspect PostgREST requests and RLS policies, then review the RPC/view security mode. Do not rely on a client-side filter as a mitigation.
