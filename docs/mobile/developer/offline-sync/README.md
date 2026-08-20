---
title: Offline behavior and synchronization
description: Document what is persisted locally, what is queried live, and how POS retries work in the current mobile app.
category: developer
language: en
keywords:
  - offline
  - synchronization
  - AsyncStorage
  - retry
  - idempotency
---

# Offline behavior and synchronization

## Local persistence found

The theme context persists theme mode, primary color, and language in AsyncStorage. The current POS screen keeps the cart and held orders in React state while mounted.

## Live data

Invoices, customers, products, payments, expenses, vendors, companies, reports, tax status, and settings are read/written through Supabase calls. The audited screens do not use a general SQLite/AsyncStorage record cache or network queue.

## Backend/offline packages

The repository contains `packages/offline-pos` and Supabase migrations for idempotency/persisted held orders. The current mobile `POSScreen` does not call the persisted held-order RPCs; that backend capability must not be documented as active mobile offline support without an integration change.

## Retry safety

Where the screen supplies an idempotency key, reuse the same key for an uncertain retry. After a failed save, check the document/payment/expense list before creating another record. Allocation and payment posting are separate operations.

## Conflict handling

No client-side conflict-resolution UI was found. The backend transaction/RPC and database constraints are the source of truth. Do not add optimistic merge behavior without documenting ownership, timestamps, and conflict rules.

## Product expectation

The current app should be described as online-first with limited local preferences and temporary POS state, not as a complete offline-first accounting/POS system.
