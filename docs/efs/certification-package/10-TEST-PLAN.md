# Test plan

Automated coverage includes provider state transitions, idempotency fingerprints, guarded production failure, secret-safe key abstraction, certification QR-content round trips, and deterministic mock outcomes. Database coverage checks EFS tables, RLS, permissions, append-only triggers, active-company authorization, and production guard behavior.

TAK-dependent test cases still require the current official schema, endpoint, signature, QR, certificate, and response fixtures. They are not replaced by assumptions.
