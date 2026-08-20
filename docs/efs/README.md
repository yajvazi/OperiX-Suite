# OperiX Kosovo EFS readiness

Status: `CONDITIONALLY READY` for software-side certification preparation. OperiX is not TAK-certified, production EFS is disabled, and no TAK production endpoint or credential is configured.

This domain is a controlled layer over the commercial transaction:

`sale/POS → VAT engine → accounting/inventory → fiscal provider boundary → signed fiscal document → TAK acknowledgement`

The implementation reuses the existing `packages/fiscalization` provider boundary and Phase E fiscal aggregates. It does not create a second fiscalization system.

## Official source set

- [Administrative Instruction (MF) No. 01/2026](https://www.atk-ks.org/wp-content/uploads/2026/06/ENG-ADMINISTRATIVE_INSTRUCTION_MF_NO._01_2026.pdf)
- [Specific Technical and Functional Requirements for EFD, FS and EFS](https://www.atk-ks.org/wp-content/uploads/2016/04/ENG-KE%CC%88RKESAT-SPECIFIKE-TEKNIKE-DHE-FUNKSIONALE-PE%CC%88R-PAJISJET-ELEKTRONIKE-FISKALE.pdf)
- [Conditions and Procedures for Application, Certification and Maintenance of EFS, final 29.05.2026](https://www.atk-ks.org/wp-content/uploads/2026/06/ENG-KUSHTET-DHE-PROCEDURAT-PER-APLIKIMIN-CERTIFIKIMIN-dhe-MIREMBAJTJEN-e-SEF-Verzioni-Final-29.05.2026.pdf)
- [TAK EDI notice: Request for Fiscalization](https://www.atk-ks.org/en/notice-to-taxpayers-new-version-of-the-edi-electronic-system-published/)

The complete traceability source is [the 2026 requirement matrix](../compliance/kosovo-efs-requirements-2026.md). Exact TAK payload schemas, endpoint URLs, authentication, signature algorithm, and QR encoding are not invented where the reviewed public documents refer to separately published technical material.

## Hard production status

- `TAK CERTIFIED`: **NO**
- `PRODUCTION EFS`: **DISABLED**
- UI wording: `OperiX EFS — Certification Pending`
- EFS values are applicant/TAK inputs; OperiX never generates a Software Solution Code, Fiscalization Number, Unique Fiscalization Code, certificate, or private key.

## Commands

```bash
npm run typecheck --workspace=@invoice-monorepo/fiscalization
npm test --workspace=@invoice-monorepo/fiscalization
npm run efs:certification-report
```

The evidence command produces a sanitized bundle and excludes private keys, credentials, passwords, and production responses.
