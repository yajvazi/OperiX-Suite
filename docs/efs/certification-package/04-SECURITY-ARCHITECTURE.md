# Security architecture

Tenant rows use company-scoped RLS and permission checks. Installation and certificate changes use authorized security-definer workflows. Fiscal evidence is append-only for ordinary application roles. Active company selection is membership-checked and cannot expand authorization. PDF generation requires an authenticated session and returns generic errors.

The remaining security review items are listed in [SECURITY.md](../SECURITY.md) and the final readiness report.
