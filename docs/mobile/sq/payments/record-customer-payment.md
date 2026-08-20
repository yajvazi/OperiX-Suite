---
title: Regjistrimi i pagesës së klientit
description: Regjistroni pagesa me para në dorë, bankë ose kartë dhe alokojini te një faturë.
category: payments
language: sq
keywords:
  - pagesë klienti
  - pagesë e pjesshme
  - alokim pagese
  - para në dorë
  - bankë
  - kartë
---

Gjuha: [English](../../en/payments/record-customer-payment.md) | **Shqip**

# Regjistrimi i pagesës së klientit

## Krijoni pagesë

1. Hapni **More > Money** ose **Record payment** nga klienti/fatura.
2. Kontrolloni numrin e pagesës.
3. Zgjidhni klientin.
4. Zgjidhni faturën e papaguar nëse pagesa duhet të alokohet.
5. Vendosni shumën; duhet të jetë më e madhe se zero.
6. Zgjidhni **Cash**, **Bank** ose **Card**.
7. Për bankë vendosni referencën.
8. Vendosni datën dhe shënimet.
9. Ruajeni.

Rrjedha poston pagesën dhe pastaj thërret alokimin. Statusi i faturës ndryshon vetëm kur alokimi kryhet. Nëse shfaqet paralajmërim, pagesa mund të ekzistojë por të mos jetë lidhur me faturën.

## Pagesë e pjesshme ose e plotë

Vendosni vetëm shumën e pranuar për pagesë të pjesshme. Përsëriteni për pagesat e tjera dhe kontrolloni bilancin e mbetur në detajin e faturës.

## Fushat

| Fusha | Kuptimi | Sjellja aktuale |
|---|---|---|
| Numri i pagesës | Referenca | Sugjerohet si `PAY-` sipas numërimit aktual dhe mund të ndryshohet |
| Data e pagesës | Data e pranimit | Parazgjedhje është data e sotme |
| Klienti | Paguesi | E detyrueshme |
| Fatura | Fatura ku alokohet | Opsionale |
| Shuma | Shuma e pranuar | E detyrueshme dhe pozitive |
| Metoda | Para, bankë ose kartë | Zgjedhje e detyrueshme |
| Referenca bankare | Numër/tekst transferi | Shfaqet për bankë |
| Shënimet | Përshkrim shtesë | Opsionale |

Lista e pagesave tregon historikun dhe totalet e hapësirës. Rimbursim i veçantë mobil nuk u gjet.

Të lidhura: [Statuset e faturës](../invoices/invoice-detail-and-statuses.md), [Klientët](../customers/manage-customers.md), [Pagesat e furnitorëve](./vendor-payments.md).
