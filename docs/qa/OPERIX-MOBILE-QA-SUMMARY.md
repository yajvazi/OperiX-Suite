# OperiX mobile QA summary

Generated: 2026-08-19T12:45:50.322Z

This is the first central status file to inspect. It reports actual runner evidence only. `READY_FOR_MANUAL_QA` is the terminal automated state; TestFlight/App Store submission is intentionally outside this pipeline.

| App | Unit | UI | Backend | Integration | Security | E2E | Visual | Build | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OperiX Booking | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | N/A | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | VISUAL_REVIEW_REQUIRED | READY (dev: NOT_RUN) | BLOCKED |
| OperiX Desk | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | N/A | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | VISUAL_REVIEW_REQUIRED | READY (dev: NOT_RUN) | BLOCKED |
| OperiX HR | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | N/A | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | VISUAL_REVIEW_REQUIRED | READY (dev: NOT_RUN) | BLOCKED |
| OperiX Invoice | PASS | PASS | ENVIRONMENT_FAILURE | PASS | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | VISUAL_REVIEW_REQUIRED | READY (dev: NOT_RUN) | BLOCKED |
| OperiX Scanner | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | N/A | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | VISUAL_REVIEW_REQUIRED | READY (dev: NOT_RUN) | BLOCKED |
| OperiX Tracker | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | N/A | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | VISUAL_REVIEW_REQUIRED | READY (dev: NOT_RUN) | BLOCKED |

## State meanings

- `NOT_TESTED`: no central run exists.
- `BLOCKED` / `BLOCKED_SECURITY`: release gates are unresolved.
- `VISUAL_REVIEW_REQUIRED`: screenshots need human review; baselines were not changed.
- `READY_FOR_MANUAL_QA`: applicable automated checks and a development build are ready for human inspection.
- `MANUAL_QA_APPROVED` does not start a release or submission; a future separately approved release workflow is required.

## Safety and execution

- Production data, production service-role keys, and automatic submission are disabled.
- Run one app with `npm run qa:mobile:invoice` or all discovered apps with `npm run qa:mobile:all`.
- Full logs and append-only run history are under `docs/qa/artifacts/` and `docs/qa/history/`.
