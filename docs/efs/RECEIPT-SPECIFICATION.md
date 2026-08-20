# Receipt and fiscal coupon model

`CanonicalFiscalDocument` is the single application model used by future mobile display, web display, PDF, thermal output, and reprint paths. It is built from a validated commercial transaction and shared VAT totals; EFS does not recalculate VAT.

The current official sources identify coupon requirements including taxpayer/fiscal identity, VAT registration where applicable, taxpayer/unit data, operator, item/quantity/price/value, VAT classification and amounts, discounts/adjustments, total, payment method, timestamp, EFS/FS/EFD identity, daily coupon number, QR, FCUIN, RKS logo, coupon type, and free text. The final exact field constraints and serialization must come from the TAK technical contract.

The renderer must preserve legally mandatory fields for 58 mm and 80 mm layouts, long Albanian names, multiple VAT rates, discounts, large totals, and QR readability. It must not label a normal OperiX invoice as a certified fiscal coupon.

QR status is explicit:

- `not_available`: no accepted fiscal QR exists;
- `test_only`: local certification fixture content only;
- `tak_verified`: reserved for a documented TAK response after certification.

The repository's `CertificationQrContentCodec` is a round-trip test codec, not the TAK QR implementation. It is intentionally prefixed `operix-efs-certification://` and cannot be used as a legal QR.
