# OperiX Kosovo EFS readiness

Verification date: **2026-08-12**

## Final result

> **EFS NOT CERTIFIED — DO NOT USE OPERIX AS A CERTIFIED FISCAL RECEIPT SYSTEM**

## Evidence

- The repository contains a provider boundary (`FiscalizationProvider` / future `KosovoEFSProvider`) but no evidence of an OperiX Kosovo EFS certificate, TAK approval, production EDI credentials, or certified fiscal software identifier.
- The database view `public.kosovo_efs_status` reports `EFS NOT CERTIFIED`.
- Mobile Tax Center and web Reports display the same warning.
- The normal invoice and POS flows create ordinary OperiX accounting documents. They do not create a certified fiscal receipt, claim electronic submission, or fabricate an EFS response.
- Tax declarations have explicit `Draft`, `Ready`, `Exported`, `Submitted manually`, `Confirmed` and `Amended` states. “Exported” is not “submitted to TAK”.

## Required evidence before a future readiness claim

1. Confirm the applicable TAK EFS certification route and current technical specification.
2. Obtain and record OperiX certification, provider approval, credentials and production endpoint evidence.
3. Implement a real provider adapter with signed/authenticated requests, response persistence, retries, idempotency and failure handling.
4. Add end-to-end sandbox and production certification tests.
5. Complete an independent legal and security review before changing the status literal.

Until all evidence exists, the status must remain the explicit not-certified result above.

