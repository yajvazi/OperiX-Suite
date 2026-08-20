---
title: Mobile architecture
description: Source-based architecture reference for OperiX Invoice Mobile.
category: developer
language: en
keywords:
  - React Native
  - Expo
  - monorepo
  - architecture
  - packages
---

# Mobile architecture

## Scope

The mobile app is an Expo SDK 54 / React Native application under:

`apps/OperiX Invoice/OperiX Invoice Mobile`

It runs in the OperiX monorepo and consumes workspace packages through TypeScript path/package aliases. The app uses React Navigation, Supabase JS, Expo modules, and shared domain/types/UI/i18n/PDF packages.

## Important directories

| Directory | Responsibility |
|---|---|
| `src/navigation` | Root/auth/tab/legacy navigators and route types |
| `src/screens` | User-facing screens grouped by feature |
| `src/components` | Mobile layout, shared controls, logo, global create action |
| `src/services` | Workspace scoping, external links, Stripe, PDF and transaction helpers |
| `src/theme` | OperiX brand palette and theme helpers |
| `packages/context` | Auth provider and Supabase session lifecycle |
| `packages/hooks` | Theme/auth hooks and shared context access |
| `packages/api` | Supabase client |
| `packages/types` | Profile, company, client, product, invoice, payment, vendor and template contracts |
| `packages/i18n` | English/Albanian translations and formatters |
| `packages/commercial-documents` | Canonical document types, effects, statuses, conversions, totals, immutability |
| `packages/invoice-template` | Shared corporate invoice HTML adapter |
| `packages/accounting`, `compliance`, `fiscalization`, `offline-pos`, `payroll`, `report-templates`, `support` | Shared/backend-facing domain packages; not every export has a mobile screen |

## Runtime composition

`src/App.tsx` wraps the app with auth and theme providers and renders `AppNavigator`. `AppNavigator` resolves auth, profile biometric state, employee pending state, and then either the auth stack, approval screen, biometric gate, or root stack.

Screens query Supabase directly through the shared client. Business queries call `getWorkspaceScope` and use `scopedResource` or explicit company IDs. Mutating financial workflows prefer RPCs for posting, idempotency, numbering, and permission checks.

## Feature status labels

- ✅ Production — implemented and reachable in the audited mobile path.
- 🟡 Partial — visible/callable but incomplete, backend-dependent, or limited.
- 🧪 Experimental — developer/test path or not presented as normal business workflow.
- 🚧 In development — source indicates active incomplete work.
- 🔒 Internal — intended for internal operators/developers.
- ⛔ Disabled — deliberately unavailable in the current configuration.
- ❌ Broken — verified build/runtime defect.

The status table in [the inventory](../../DOCUMENTATION-INVENTORY.md) and [known limitations](../../KNOWN-LIMITATIONS.md) is the source of current findings.

## Architectural invariants

1. Commercial document identity is explicit; PDF headings are presentation only.
2. Existing invoices/invoice items remain compatibility storage for the shared commercial-document domain.
3. The client is tenant-aware, but UI checks never replace database RLS or RPC authorization.
4. Accounting/VAT/fiscalization effects are not inferred from a screen label; posting services and database state are authoritative.
5. Issued financial records must remain traceable; correction flows create new records.
