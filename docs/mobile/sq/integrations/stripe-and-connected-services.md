---
title: Stripe, PayPal dhe shërbimet e lidhura
description: Kuptoni integrimet e pagesave, sinkronizimin e Stripe dhe lidhjet PayPal.
category: integrations
language: sq
keywords:
  - Stripe
  - Stripe Connect
  - PayPal
  - integrim pagese
  - sinkronizim
---

Gjuha: [English](../../en/integrations/stripe-and-connected-services.md) | **Shqip**

# Stripe, PayPal dhe shërbimet e lidhura

Hapni **More > Integrations**.

## Stripe

Kodi ka OAuth të Stripe Connect dhe dashboard. Në varësi të lidhjes mund të nisni OAuth në shfletues, të lexoni statusin, të sinkronizoni transaksione dhe payout-e përmes Edge Function, të përdorni rrugën developer me API key, të shihni përmbledhje, të regjistroni të hyra nga payout-i dhe të shkëputni llogarinë.

Sinkronizimi mund të jetë inkremental ose i thellë. Dashboard-i tregon sinkronizimin e fundit kur ruhet.

## PayPal

Integrimi ruan një lidhje pagese PayPal dhe mund ta pastrojë. Sinkronizim i plotë i transaksioneve PayPal nuk u gjet në kodin mobil.

## Siguria

Mos vendosni çelës sekret Stripe në dokumente, screenshots, ticket-a ose biseda. Rruga me API key është developer mode dhe duhet rishikuar përpara përdorimit të gjerë; preferohet rruga server-side kur është e aktivizuar.

Në gabim kontrolloni kompaninë, lidhjen dhe Edge Function me administratorin. Shihni [Zgjidhja e problemeve](../troubleshooting/common-problems.md).
