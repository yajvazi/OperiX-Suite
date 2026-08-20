# OperiX Tracker E2E flows

- App: OperiX Tracker
- Path: `apps/OperiX Tracker`
- Standard: Maestro (real simulator/emulator only)
- QA data: dedicated non-production accounts/tenants only
- Latest execution: ENVIRONMENT_FAILURE

## Discovered routes

- `SignIn`
- `SignUp`

## Major user journey

1. Login
2. Time/location dashboard
3. Create/update tracking record
4. Protected screen access
5. Logout

## Flow requirements

- Use stable accessibility labels/test IDs following `<screen>-<element>-<action>`.
- Assert loading, empty, error, protected-route, and success states where they exist.
- Tag all created data with the QA namespace and clean only that data.
- Capture console/runtime/network failures as separate evidence.
- Do not run against production or use customer accounts.

## Current limitation

- No Maestro or Detox flow/configuration was discovered for this app.
