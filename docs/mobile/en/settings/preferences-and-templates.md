---
title: Preferences, company profile, numbering, and templates
description: Configure language, appearance, company branding, bank details, security, exports, and document templates.
category: settings
language: en
keywords:
  - settings
  - language
  - theme
  - logo
  - bank details
  - invoice numbering
  - templates
---

Language: **English** | [Shqip](../../sq/settings/preferences-and-templates.md)

# Preferences, company profile, numbering, and templates

Open **More > Settings**. Sections are expandable and changes generally save when editing ends.

## Language and appearance

- **Language**: English or Shqip. The selection is stored locally and updates the app translation locale.
- **Theme**: System, Light, or Dark.
- **Brand color**: choose from the available palette, including OperiX blue.

## Company profile

The active company profile can include company name, tax/registration ID, email, phone, address, city, country, and website. These values can appear in PDFs and company cards. Company switching and member management are separate actions under [Manage companies](../company/manage-companies-and-members.md).

## Logo, signature, and stamp

The identity/visuals section can select a logo, upload a signature image, draw a signature, and select an official-stamp image. These assets are stored on the profile/company record as URL/data values used by document generation. A decorative image does not by itself constitute a qualified electronic signature.

## Bank details

The bank section stores bank name, IBAN, and SWIFT/BIC for document payment instructions. These values can be rendered in a PDF; they do not initiate a bank transfer.

## Security

The security section can enable the biometric lock. The next authenticated app gate asks the device for biometric/passcode verification. See [Authentication](../getting-started/sign-in-and-account.md).

## Advanced settings and export

Advanced settings reads profiles, document sequences, and workspace records. The export action can prepare JSON or CSV data for invoices, clients, products, expenses, and vendors and opens the native share sheet. It is a client-side export of queried records, not a complete database backup.

## Invoice numbering

The backend has a transactional document-sequence allocator and independent document-type sequence vocabulary. The current allocator supports invoice/offer/proforma/order compatibility types and a fiscal-year period key. Do not manually reuse an issued number. If the preview, legacy list, and saved number disagree, stop and contact an administrator rather than editing the issued document.

## Templates

The settings stack registers invoice template settings, a general template editor, contract templates, and a contract-template editor. Shared template configuration can control logo, signature, buyer signature, stamp, QR visibility, notes, discount, tax, bank details, visible columns, page size, and labels. The mobile preview currently follows the PDF factory’s corporate/thermal behavior; see [PDF actions](../invoices/pdf-sharing-and-printing.md).
