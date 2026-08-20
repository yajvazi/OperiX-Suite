---
title: Security, tenant isolation, and sensitive data
description: Security reference for mobile authentication, company scope, RLS, permissions, local data, and integrations.
category: developer
language: en
keywords:
  - security
  - RLS
  - tenant isolation
  - permissions
  - secrets
---

# Security, tenant isolation, and sensitive data

## Authentication

Supabase Auth owns the session. The mobile app uses the public anon client configuration and never has authority to bypass RLS. See [Authentication](../authentication/README.md).

## Tenant isolation

The active company comes from `profiles.active_company_id` or the profile company fallback. `getWorkspaceScope` derives descendant company IDs. Screens add those IDs to queries; database RLS and security-definer RPC permission checks are still mandatory.

Legacy company-null rows are intentionally included only when `user_id` matches the current user in `scopedResource`. Verify that this behavior is compatible with the latest policy in the target database.

## Roles and permissions

Owner/admin/worker are visible roles. App permissions such as `sales_invoice.post`, `journal.post`, `roles.manage`, and POS permissions are checked in backend functions/migrations. Do not use UI role checks as authorization.

## Immutable financial records

Issued/posting fields, commercial status, original-document links, source links, and event history support traceability. Destructive UI actions must remain guarded by server permissions and accounting state.

## Sensitive values

Do not expose Supabase service-role keys, refresh/access tokens, Stripe secret API keys, SMTP passwords, or invitation tokens. The Stripe developer API-key path deserves particular review because source code includes direct API requests; prefer server-side token handling.

## Files and images

The current mobile path can place image data in profile/expense fields. Review payload size, storage policy, MIME validation, and company path isolation before expanding it. Do not include private customer documents in public screenshots.

## Security review checklist

- Test owner/admin/worker against every write RPC.
- Test a user in company A querying company B, including descendants/siblings.
- Test direct PostgREST access, not only UI navigation.
- Test issued invoice edit/delete and correction permissions.
- Verify error messages do not include tokens or secrets.
- Review Stripe and SMTP fields before production builds.
