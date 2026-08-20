---
title: Pika e shitjes
description: Ndërtoni shportën, zgjidhni klientin dhe mënyrën e pagesës dhe dërgojeni shitjen në rrjedhën e faturës.
category: pos
language: sq
keywords:
  - POS
  - pikë shitjeje
  - shportë
  - arkë
  - porosi e mbajtur
---

Gjuha: [English](../../en/pos/point-of-sale.md) | **Shqip**

# Pika e shitjes

Skeda e poshtme **Invoice** hap POS-in, sepse shporta e përfunduar kalon në rrjedhën e faturës.

## Nisni shitjen

1. Kërkoni produkt ose zgjidhni kategori.
2. Shtypni produktin për ta shtuar.
3. Përdorni plus/minus për sasinë.
4. Zgjidhni klientin ose **Qytetar**.
5. Kontrolloni totalin e shportës.
6. Zgjidhni cash, card, debt ose other.
7. Vazhdoni në formularin e faturës.
8. Kontrolloni klientin, taksat dhe pagesën.
9. Ruajeni/krijoni faturën.

POS-i nuk krijon vetë një kupon të pavarur. `InvoiceFormScreen` merr shportën, klientin, metodën dhe idempotency key dhe rrjedha e ruajtjes thërret RPC-në e faturës me stok.

## Stoku dhe totali

Produktet e ndjekura kufizojnë sasinë. Totali i shportës është sasi × çmim; tatimi dhe totali final përpunohen në formularin e faturës. Kontrolloni faturën finale.

## Mbajtja e shportës

Shporta mund të mbahet dhe rikthehet sa kohë ekrani është i hapur. Kodi aktual e ruan në state të React-it. Rinisja ose çmontimi i ekranit mund ta humbë atë; nuk u gjet thirrje nga ky ekran për radhë offline të qëndrueshme.

Nuk u gjetën rrjedha të plota mobile për mbyllje turni arke, barazim sirtari, kthime, rimbursime ose printer kuponësh.

Të lidhura: [Inventari](../inventory/stock-and-low-stock.md), [Fatura](../invoices/create-and-edit.md), [Pagesat](../payments/record-customer-payment.md).
