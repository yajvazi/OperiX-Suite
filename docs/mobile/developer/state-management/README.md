---
title: State management
description: Explain auth, theme, workspace, form, list, and document state in OperiX Invoice Mobile.
category: developer
language: en
keywords:
  - state
  - React state
  - context
  - cache
  - forms
---

# State management

## Global providers

- `AuthProvider` owns `user`, `session`, and loading state and listens to Supabase auth events.
- `ThemeProvider` owns theme mode, dark mode, primary color, language, and persisted preference values.
- Hooks from `packages/hooks` expose the providers to screens.

## Workspace state

There is no global normalized tenant store. Screens call `getWorkspaceScope(user.id)` on load/focus and derive `companyId`, descendant `companyIds`, profile, and active company. `scopedResource` builds a PostgREST OR expression for legacy creator-owned rows and accessible company rows.

## Feature state

Most screens use local React state and reload on focus:

- invoice form: dates, customer, lines, totals, payment/signature, source document;
- POS: products, search, customer, cart, payment modal, temporary held orders;
- lists: query results, search/filter/sort, loading/error/refresh;
- settings: profile plus expanded section and optimistic edits;
- reports: selected report rows and export state.

There is no React Query/Redux/Zustand cache visible in the audited mobile source. Mutations generally navigate back and the previous screen reloads on focus.

## Idempotency

POS invoice, payment, expense, and posting/conversion paths pass idempotency keys to backend operations where implemented. Keep keys stable for a retry of the same user command and do not generate a new economic event on an uncertain retry.

## Forms and optimistic updates

Settings updates optimistically update local profile state and then write profile/company fields. Invoice editing replaces invoice items in the non-POS path. Error handling must account for a successful insert followed by a later item/allocation failure.
