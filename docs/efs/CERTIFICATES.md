# Certificate lifecycle

`fiscal_certificates` stores issuer, serial, fingerprint, validity, status, installation association, and opaque secret reference. The metadata workflow supports pending, active, expired, revoked, and invalid states and records configuration history.

The health check must warn before expiry and must refuse signing with an expired, revoked, or invalid certificate. The exact certificate type, issuer, registration, and revocation behavior remain TAK/applicant dependencies from the official technical and certification documents.

No certificate or private key is committed in the repository. A certified installation must be associated with the exact release manifest and installation/POS identity used during TAK testing.
