# OperiX mobile QA system

The shared runner is `node scripts/operix-mobile-qa.mjs`. It discovers verified Expo/React Native apps from package and Expo configuration, runs the checks that an app actually declares, records unavailable environment-dependent checks without treating them as passes, and generates reports under `docs/qa/`.

From the repository root:

```sh
npm run qa:mobile:all
npm run qa:mobile:invoice
node scripts/operix-mobile-qa.mjs operix-hr --no-install
node scripts/operix-mobile-qa.mjs inventory
```

The default workflow never invokes `eas submit`, `expo submit`, App Store Connect, or TestFlight. Development-build preparation is opt-in with `--prepare-build` and remains separate from submission.

## Environment policy

Use a dedicated non-production Supabase project or local Supabase stack. The runner only recognizes QA variables prefixed with `OPERIX_QA_` for integration/security checks. It does not print their values and removes service-role variables from child mobile processes. Do not put a service-role key in an Expo app or any `EXPO_PUBLIC_*` variable.

The full security/RLS suite stays blocked until a safe QA database and deterministic Tenant A/Tenant B accounts are available. A missing QA environment is reported as an environment failure, never as a security pass.

## Failure integrity

The runner does not delete tests, skip failures, change assertions, update visual baselines, disable RLS, weaken authorization, or apply broad dependency upgrades. It captures the command, sanitized log, classification, diagnosis, and bounded attempt count. Application changes must be made separately, then the same app can be rerun.

## Visual regression

Approved baselines belong under `qa/mobile/visual-baselines/<app-id>/`. Actual screenshots and diffs are written under `docs/qa/artifacts/`. Baselines are never overwritten by a normal run. The explicit update command requires a human-approval flag and a repository-local source directory:

```sh
npm run test:visual:update -- operix-invoice --from docs/qa/artifacts/<run-id>/operix-invoice/visual/actual --human-approved
```

## Manual QA gate

An app can reach `READY_FOR_MANUAL_QA` only after applicable automated checks and a development build are ready. A human can then record a decision:

```sh
node scripts/operix-mobile-qa.mjs approve operix-invoice
node scripts/operix-mobile-qa.mjs manual-fail operix-invoice --issue "Describe the reproducible issue"
```

Approval changes only the manual-QA state. It does not submit or publish anything.
