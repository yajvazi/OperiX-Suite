# OperiX mobile manual QA gate

The central automation stops at `READY_FOR_MANUAL_QA`. It never calls TestFlight, App Store Connect submission, or a production rollout.

## Before starting

1. Use a dedicated QA Supabase project/local stack and QA-only Tenant A/Tenant B accounts.
2. Boot the intended simulator/emulator yourself. The iOS debugger workflow does not boot a simulator automatically.
3. Install Maestro on a simulator-capable host when the app has Maestro flows.
4. Review the app report, sanitized logs, and any baseline/actual/diff screenshots under `docs/qa/`.

## Run one app

```sh
npm run qa:mobile:invoice
npm run qa:mobile:hr
npm run qa:mobile:booking
npm run qa:mobile:desk
npm run qa:mobile:tracker
npm run qa:mobile:scanner
```

For a configured simulator and QA environment, use the real-device gate:

```sh
node scripts/operix-mobile-qa.mjs operix-invoice --prepare-build
```

The command may queue an EAS development build. It does not submit the app. A build can be opened with the development client and the app-specific flow document.

## Review checklist

- Fresh launch, loading, empty, error, and offline states.
- Login, invalid login, logout, expired/restored session, and protected screens.
- Tenant A cannot read, create for, update, or delete Tenant B data.
- Role-restricted UI is absent/inactive for unauthorized roles and backend calls are rejected independently.
- Major domain journey for the app (Invoice, HR, Booking, Desk, Tracker, or Scanner).
- English and Albanian where the app claims both; check wrapping, clipping, and untranslated keys.
- Small and large iPhone layouts, with representative Android when supported.
- Runtime exceptions, unhandled promise rejections, functional React Native warnings, and failed network calls.
- Approved screenshot baseline versus actual and diff. Do not approve expected visual changes automatically.

## Record the decision

Only after the automated report says `READY_FOR_MANUAL_QA` and the human review is complete:

```sh
node scripts/operix-mobile-qa.mjs approve operix-invoice
```

If manual QA finds a problem:

```sh
node scripts/operix-mobile-qa.mjs manual-fail operix-invoice --issue "Reproducible steps and observed result"
```

Then fix the application/test with the smallest safe change, add a regression test where possible, rerun the targeted and full suite, rebuild, and return to `READY_FOR_MANUAL_QA`.
