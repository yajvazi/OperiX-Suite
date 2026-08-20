---
title: PDF generation and document templates
description: Technical reference for invoice, transaction, contract, preview, sharing, and print PDF paths.
category: developer
language: en
keywords:
  - PDF
  - Expo Print
  - Expo Sharing
  - invoice template
  - HTML
---

# PDF generation and document templates

## Invoice path

`src/services/pdf/TemplateFactory.ts` chooses the corporate invoice template for ordinary output and the receipt template for thermal/receipt conditions. `services/pdf/pdfService.ts` calls `expo-print` to create a file, `expo-sharing` to share it, and `expo-print` again for native print.

The detail screen builds `InvoiceData` from profile/company, customer, invoice, items, payments, branding, bank values, and document type. It can hide fiscal identifiers for operational document types.

## Shared templates

The mobile source contains template adapters/HTML for corporate, receipt/thermal, and legacy classic/creative/kosovo/minimalist/modern files. `TemplateFactory` currently exposes a narrower `TemplateType` contract (`corporate`/`thermal`) than the full legacy file set. The saved/template settings surface and preview behavior must be tested together.

## Transaction PDFs

`transactionPdf.ts` creates a simple A4 HTML/PDF for payment/expense transaction sharing. Reports build their own HTML table and print landscape output; they do not use the invoice template factory.

## Contract PDFs

`contractTemplates.ts` contains HTML for service agreements, NDAs, and generic contracts. Contract detail controls the input data.

## Authorization and privacy

PDF data is built only after the screen reads a company-scoped record. Preserve RLS and avoid public bearer identifiers. QR data uses the repository’s public QR reference contract; do not turn invoice numbers into secrets. Do not log HTML containing customer data.

## Known mismatch

The invoice preview screen currently calls the corporate template directly even though broader template files exist. Record any template change in the screenshot plan and test PDF output on iOS, Android, and web where supported.
