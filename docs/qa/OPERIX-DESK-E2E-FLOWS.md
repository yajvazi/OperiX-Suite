# OperiX Desk E2E flows

- App: OperiX Desk
- Path: `apps/OperiX Desk/OperiX Desk Mobile`
- Standard: Maestro (real simulator/emulator only)
- QA data: dedicated non-production accounts/tenants only
- Latest execution: ENVIRONMENT_FAILURE

## Discovered routes

- `Bookings`
- `Floor`
- `Home`
- `MainTabs`
- `More`
- `Reserve`
- `SignIn`

## Major user journey

1. Login
2. Home
3. Floor plan/resources
4. Bookings
5. Reserve resource
6. Notifications/More
7. Logout

## Flow requirements

- Use stable accessibility labels/test IDs following `<screen>-<element>-<action>`.
- Assert loading, empty, error, protected-route, and success states where they exist.
- Tag all created data with the QA namespace and clean only that data.
- Capture console/runtime/network failures as separate evidence.
- Do not run against production or use customer accounts.

## Current limitation

- No Maestro or Detox flow/configuration was discovered for this app.
