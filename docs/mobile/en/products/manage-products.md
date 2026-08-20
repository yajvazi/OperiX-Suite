---
title: Manage products and services
description: Create catalog items, configure prices and VAT, track stock, and select products during invoicing.
category: products
language: en
keywords:
  - product
  - service
  - SKU
  - barcode
  - stock
  - VAT
---

Language: **English** | [Shqip](../../sq/products/manage-products.md)

# Manage products and services

## Create a product or service

1. Open **Business > Products**.
2. Tap **Add product**.
3. Enter the name.
4. Add description, SKU/barcode, category, unit, selling price, tax rate, and whether tax is included.
5. If inventory is relevant, set stock quantity, **Track stock**, and the low-stock threshold.
6. Use the advanced import-cost fields only when they apply to your catalog.
7. Tap **Save**.

## Main fields

| Field | Meaning | Current behavior |
|---|---|---|
| Name | Catalog name shown in lists and invoice lines | Required |
| Description | Additional product/service text | Optional |
| SKU | Internal stock code | Optional; scanner can populate it |
| Barcode | Barcode value | Optional; product list can search/scan it |
| Unit price | Selling price | Required by the validation path; displayed as a money value |
| Tax rate | Product tax percentage | Copied into invoice lines |
| Tax included | Whether the stored price includes tax | Stored on the product; review the invoice summary after selection |
| Unit | pcs, hrs, kg, lbs, mt, ft, l, gal, or unit | Selected from the form’s choices |
| Category | Service, Product, Subscription, Consulting, or custom category | Used for filtering/organization |
| Stock quantity | Current quantity value | Used by stock cards and POS availability |
| Track stock | Enables tracked stock behavior | POS uses it to limit/add stock-aware quantities |
| Low-stock threshold | Alert/list threshold | Used for low-stock count/status |
| Import cost fields | Supplier price, discount, transport, customs, excise, import VAT, tariff, origin, and VAT treatment | Optional advanced product-cost data; not a complete landed-cost reporting screen |

VAT treatment choices in the current form include standard 18%, reduced 8%, exempt options, export, reverse charge, and out of scope. Selecting a label does not replace reviewing the applicable tax treatment for the transaction.

## Search, filter, and product detail

The product list searches name, SKU, barcode, and description; filters by category; and sorts by name, price, or stock. It displays total products, total stock value based on unit price × quantity, low-stock count, and out-of-stock count.

Product detail shows category, VAT rate, current stock, tracking, SKU/barcode, and an action to create an invoice with the product preselected.

## Delete

The current list exposes delete rather than a dedicated archive flow. Check dependencies and company policy before deleting a catalog item used by historical documents.

Related: [Inventory](../inventory/stock-and-low-stock.md), [POS](../pos/point-of-sale.md), [Create an invoice](../invoices/create-and-edit.md).
