# EFS change control

EFS changes are classified separately from ordinary UI changes.

## Critical changes

Signing, canonical payload, mandatory fields, VAT mapping, rounding, fiscal numbering, transaction types, return/correction behavior, QR data, receipt layout/content, certificates, provider transport, retry/offline behavior, database uniqueness/RLS, and production guards require EFS review, regression evidence, a new release manifest, and a TAK impact decision.

## Non-critical changes

Copy, spacing, non-fiscal navigation, and accessibility changes may use the normal review path only when they do not alter fiscal content, data flow, permissions, or rendering of mandatory fields.

Every release records whether it changes a certified surface. Certification cannot be inferred from a green build; the exact certified version must remain identifiable.
