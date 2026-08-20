# OperiX mobile app inventory

Generated: 2026-08-19T12:45:50.322Z

Only apps verified by the central discovery rules are included: an Expo dependency, a React Native dependency, an Expo app configuration, and an `OperiX` Expo app name.

| App | Path | Framework | Expo SDK | Bundle ID | Backend | Test Status | Build Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OperiX Booking | `apps/OperiX Booking/OperiX Booking Mobile` | Expo / React Native | 54 | com.operixsuite.booking | Supabase / PostgreSQL (shared workspace) | BLOCKED | READY (dev: NOT_RUN) |
| OperiX Desk | `apps/OperiX Desk/OperiX Desk Mobile` | Expo / React Native | 54 | com.operix.desk | Supabase / PostgreSQL (shared workspace) | BLOCKED | READY (dev: NOT_RUN) |
| OperiX HR | `apps/hr-app` | Expo / React Native | 54 | com.internetkudo.hrapp | Supabase / PostgreSQL (shared workspace) | BLOCKED | READY (dev: NOT_RUN) |
| OperiX Invoice | `apps/OperiX Invoice/OperiX Invoice Mobile` | Expo / React Native | 54 | com.lrdygroup.operixinvoice | Supabase / PostgreSQL (shared workspace) | BLOCKED | READY (dev: NOT_RUN) |
| OperiX Scanner | `apps/OperiX Scanner` | Expo / React Native | 54 | com.internetkudo.operixscanner | Supabase / PostgreSQL (shared workspace) | BLOCKED | READY (dev: NOT_RUN) |
| OperiX Tracker | `apps/OperiX Tracker` | Expo / React Native | 54 | com.internetkudo.operixtracker | Supabase / PostgreSQL (shared workspace) | BLOCKED | READY (dev: NOT_RUN) |

## Discovery notes

- The canonical source is the `/root/OperiX` monorepo. Duplicate/standalone worktrees and the unrelated `IKDMOBILE` repository are not included.
- Dynamic `app.config.*` files are inspected as source; static metadata is taken from `app.json` without printing environment values.
- Test/build states are read from the latest machine-readable result when one exists. No result is fabricated for an unrun app.
