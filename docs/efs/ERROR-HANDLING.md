# EFS errors

The provider boundary normalizes actionable categories:

`FISCAL_CONFIGURATION_MISSING`, `CERTIFICATE_MISSING`, `CERTIFICATE_EXPIRED`, `CERTIFICATE_INVALID`, `KEY_UNAVAILABLE`, `INVALID_FISCAL_TRANSACTION`, `SIGNATURE_FAILED`, `TAK_TIMEOUT`, `TAK_UNAVAILABLE`, `TAK_REJECTED`, `DUPLICATE_FISCALIZATION`, `OFFLINE_LIMIT_REACHED`, `UNSUPPORTED_TRANSACTION`, `TECHNICAL_INPUT_REQUIRED`, `PRODUCTION_DISABLED`, and `UNAUTHORIZED`.

User-facing messages should be Albanian/English and should not include raw signatures, keys, tokens, provider headers, or unredacted responses. The stored response is sanitized and fingerprinted; the original secret-bearing response is not persisted.

Retryable errors create durable retry work only when the current TAK rules permit deferred submission. A sent request without an accepted response remains non-final.
