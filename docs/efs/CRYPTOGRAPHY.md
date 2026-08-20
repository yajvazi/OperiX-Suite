# Cryptography

No TAK signing algorithm is guessed. The package exposes a `FiscalKeyProvider` whose business logic receives a signing result but never receives raw private-key material. Production adapters are expected to call a KMS, HSM, Vault, or equivalent server-side signing service.

The current `DevelopmentTestKeyProvider` is deterministic and explicitly `productionSafe: false`. It is suitable only for unit tests. It is not a digital signature and must never appear on a production path.

Required known-answer tests once TAK supplies the contract:

- valid payload/signature;
- changed amount, VAT, timestamp, invoice number, and payload order;
- wrong/expired certificate;
- corrupted signature;
- key unavailable;
- exact encoding and canonicalization.

Until those inputs are received, the cryptographic readiness status is `TAK DEPENDENCY` and production fiscalization is blocked.
