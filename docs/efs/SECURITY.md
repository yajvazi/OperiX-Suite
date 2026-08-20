# EFS security controls

Implemented controls:

- tenant RLS and permission policies on EFS installations, certificates, history, events, and receipts;
- active-company switching now uses a membership-checked RPC and is not an authorization grant;
- append-only fiscal evidence rows and protected configuration mutation workflow;
- secret-looking JSON rejection and opaque key/certificate references;
- backend production guard with production disabled by default;
- authenticated PDF generation with generic errors and safe filenames;
- no private keys in the repository or evidence export.

Residual production blockers:

- exact TAK endpoint/auth/signature/QR contract is not configured;
- no KMS/HSM/Vault signing provider is connected;
- existing manual customer-wide portal links require expiry/revocation migration; QR-created links now use opaque, invoice-scoped tokens and the public response is allowlisted;
- broad legacy commercial-table CRUD policies, client-side payment-provider secrets, and source-unbound transaction-report PDFs still require a separate production hardening pass;
- non-placeholder worktree environment files require deployment-owner rotation and secret-store migration; values are excluded from evidence;
- privileged database/deployment roles still require operational review for FORCE RLS, truncation, and tamper-evident evidence export;
- offline device signatures and exact TAK offline limits require formal verification.

See the independent security scan artifacts and the final report for severity and remediation status.
