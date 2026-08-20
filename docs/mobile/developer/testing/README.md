---
title: Testing and verification
description: Run the current mobile typecheck, navigation test, build check, localization check, and documentation validation.
category: developer
language: en
keywords:
  - tests
  - typecheck
  - Expo export
  - localization check
  - documentation links
---

# Testing and verification

## Mobile scripts

Run from `apps/OperiX Invoice/OperiX Invoice Mobile`:

```bash
npm run typecheck
npm run test
npm run build:check
npm run localization:check
```

`test` runs typecheck and `src/navigation/navigation.test.mjs`. `build:check` runs Expo web export to a temporary directory. `localization:check` runs the repository mobile-locale script.

## Current findings from the audit

At the documentation audit, `npm run typecheck`, the navigation test, the localization check, and the Expo web build check passed. The localization check still reports eight same-value pairs for review, and runtime report-preview strings include hard-coded English.

## Behavioral test matrix

At minimum test:

- auth sign-in/sign-up/OTP/Google/join/approval/biometric;
- company switching, descendants, invitations, role updates, removal, archive;
- invoice draft/edit/issued protection, numbering, PDF, sharing, payment;
- quote/proforma/order/delivery/advance/final/credit/debit conversion and source links;
- POS stock limits, idempotent checkout, held-cart limitation;
- customer/product/vendor/expense/payment forms and scope;
- report rows, empty/error/export states;
- EFS not-certified state and absence of fiscal claims;
- English/Albanian labels and long text layout.

## Documentation validation

Check that every file under `docs/mobile/en` has a same-path file under `docs/mobile/sq`, that each page has frontmatter/language navigation, and that all relative links resolve. Check all source route names in the inventory against `AppNavigator.tsx` and `navigation/types.ts` after route changes.
