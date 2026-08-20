---
title: Fiscalization status and EFS behavior
description: Understand what the current mobile app shows about Kosovo EFS fiscalization and what it does not claim.
category: fiscalization
language: en
keywords:
  - EFS
  - fiscalization
  - fiscal receipt
  - TAK
  - certified
---

Language: **English** | [Shqip](../../sq/fiscalization/status-and-eligibility.md)

# Fiscalization status and EFS behavior

The Tax Center reads `kosovo_efs_status` for the selected company IDs. If no accepted status is available, the UI displays **EFS NOT CERTIFIED** and a production-disabled warning.

## What this means for users

- A normal invoice, quote, proforma, order, or delivery note is not automatically a fiscal receipt just because it has a PDF.
- The shared domain contains a `FISCAL_RECEIPT` type and provider-only fiscalization effect, but this type is not a proof that EFS is enabled.
- The current mobile source does not demonstrate TAK acceptance, a fiscal QR/receipt returned from a live provider, or production certification.

Do not add fiscal identifiers to a PDF manually and do not tell a customer that an emailed PDF is a fiscal receipt. Follow the company’s approved fiscalization process and the current official requirements outside this user guide.

## Troubleshooting the status

If the status is unexpected, confirm the selected company, query permissions, and `kosovo_efs_status` record with an authorized administrator. A report/query failure is not the same as an accepted fiscalization response.

Related: [Tax Center](../taxes/tax-center.md), [Commercial document types](../documents/commercial-document-types.md). Developer EFS notes are maintained separately from the mobile Help Center.
