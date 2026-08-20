# TAK integration boundary

The reviewed Administrative Instruction and technical requirements require documented TAK interfaces, secure transport, signing, structured requests/responses, registration data, and separate test/production environments. The reviewed public documents refer to exact data structures, endpoints, registration, certificate, signature, request/response, error, and version material being supplied separately.

Therefore `KosovoEFSProvider` intentionally stops at `TECHNICAL_INPUT_REQUIRED`. OperiX does not:

- guess endpoint URLs or XML/JSON schemas;
- scrape EDI or automate browser forms;
- reverse-engineer undocumented requests;
- generate TAK-issued identifiers;
- connect a development build to TAK production.

## Required integration inputs

| Input | Owner | Current state |
|---|---|---|
| Exact TAK EFS schema and version | TAK | Required |
| Documented test/prod endpoints and authentication | TAK | Required |
| Signature algorithm, canonicalization, encoding | TAK | Required |
| QR payload/encoding specification | TAK | Required |
| EFS/Software Solution Code | TAK/applicant | Not configured |
| Fiscalization Number | TAK/applicant | Not configured |
| Taxpayer Unique Fiscalization Code | taxpayer through EDI | Not configured |
| Installation certificate and secure key | TAK/applicant/security operator | Not configured |
| Formal certification of exact release | TAK | Not submitted |

The [EDI notice](https://www.atk-ks.org/en/notice-to-taxpayers-new-version-of-the-edi-electronic-system-published/) states that the Unique Fiscalization Code is requested through EDI; it is never generated locally by OperiX.
