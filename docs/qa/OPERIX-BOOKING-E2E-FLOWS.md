# OperiX Booking E2E flows

- App: OperiX Booking
- Path: `apps/OperiX Booking/OperiX Booking Mobile`
- Standard: Maestro (real simulator/emulator only)
- QA data: dedicated non-production accounts/tenants only
- Latest execution: ENVIRONMENT_FAILURE

## Discovered routes

- `Auth`
- `BookingDetail`
- `Bookings`
- `Calendar`
- `Home`
- `Main`
- `More`
- `NewBooking`

## Major user journey

1. Login
2. Home
3. Bookings list
4. Calendar
5. Create booking
6. Booking detail/workflow action
7. Logout

## Flow requirements

- Use stable accessibility labels/test IDs following `<screen>-<element>-<action>`.
- Assert loading, empty, error, protected-route, and success states where they exist.
- Tag all created data with the QA namespace and clean only that data.
- Capture console/runtime/network failures as separate evidence.
- Do not run against production or use customer accounts.

## Current limitation

- No Maestro or Detox flow/configuration was discovered for this app.
