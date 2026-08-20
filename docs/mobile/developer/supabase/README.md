---
title: Supabase client and database integration
description: Explain how the mobile app connects to Supabase and how migrations, RLS, and RPCs fit together.
category: developer
language: en
keywords:
  - Supabase
  - RLS
  - PostgREST
  - migrations
  - anon key
---

# Supabase client and database integration

## Client configuration

`packages/api/src/supabase.ts` creates the client with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The mobile `.env`/build environment supplies these values. A Supabase server is not bundled into Expo Go or the mobile binary; the app connects to the local Supabase stack configured for the device or simulator.

The local Supabase anon/publishable key is a public client credential and is not a service-role key. Never put a service-role key in Expo variables, the app bundle, screenshots, or documentation.

## Data access pattern

Screens call `.from(table).select/insert/update/delete` and `.rpc(function, args)`. `getWorkspaceScope` loads the user profile, active company, company hierarchy, and descendant IDs. `scopedResource` includes creator-owned legacy rows without a company and rows for accessible company IDs.

## Migrations

The app’s current schema is the result of the ordered migrations in the repository’s local Supabase project. Relevant commercial-document migrations upgrade the existing invoices/invoice_items tables, add canonical type/status/effect fields, shared views, source links, line quantities, numbering, events, advance links, and access grants. Do not recreate quotes, proformas, orders, delivery notes, and invoices as unrelated tables without an explicit architecture decision.

## RLS and RPC boundary

Tenant RLS and security-definer RPCs are the authority. Client-side company filters improve query correctness but cannot protect data on their own. When adding a table, add company ownership/membership checks, indexes, policies, and tests before adding a mobile screen.

## Operational checks

For a migration change, inspect `supabase/migrations`, run the repository’s migration/type checks in the intended environment, test both owner/admin/worker paths, and verify that legacy company-null records remain intentionally accessible only to their creator where the policy says so.
