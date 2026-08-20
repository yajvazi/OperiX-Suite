# Certificate and key management

OperiX stores certificate metadata and an opaque secret reference only. Production signing must be supplied by a server-side KMS, HSM, Vault, or equivalent secure service. The development signer is test-only and reports `productionSafe: false`.

The applicant/security operator must provide the actual certificate and key-management evidence. No production certificate or private key is included in this package.
