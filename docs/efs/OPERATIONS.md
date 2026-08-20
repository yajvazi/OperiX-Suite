# EFS operations

Operators must monitor installation status, certificate expiry, retry queues, rejected responses, duplicate/reconciliation states, clock health, and receipt rendering. Every setup, certificate assignment, activation/deactivation, fiscalization attempt, failure, retry, correction, return, and reprint is an audit event.

Production activation requires a change-controlled certified release, TAK/applicant identifiers, a valid installation certificate, a production-safe key provider, test evidence, and explicit feature-flag approval. A company or POS can be deactivated without deleting fiscal history.

The release manifest identifies product version, commit, build ID, schema version, fiscal module version, and release date. Certificate expiry warnings are expected at 30 days and 7 days, with an expired hard stop.
