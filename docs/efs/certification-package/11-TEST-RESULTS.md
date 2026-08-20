# Test results

Last software-only run:

- `@invoice-monorepo/fiscalization` typecheck: PASS
- `@invoice-monorepo/fiscalization` tests: PASS (11 tests)
- `web-suite` TypeScript check: PASS
- `web-suite` unit tests: PASS (27 tests across 8 files)
- `web-suite` production build: PASS
- `operix-invoice` TypeScript check and navigation regression: PASS (2 tests)
- `operix-invoice` Expo web export: PASS
- `supabase/tests/kosovo_efs_readiness.sql`: PASS, including profile-company and invoice-scoped QR guards
- `npm run efs:certification-report`: PASS, 23 sanitized artifacts with no keys or secrets
- Supabase local schema lint: PASS with two pre-existing payroll/accounting warnings
- New EFS SQL schema applied to local database: PASS

TAK endpoint, signature, certificate, and QR conformance: `TAK DEPENDENCY`, not claimed as passed.
