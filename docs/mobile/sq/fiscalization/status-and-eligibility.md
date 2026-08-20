---
title: Statusi i fiskalizimit dhe EFS
description: Kuptoni çfarë tregon aplikacioni për EFS dhe çfarë nuk pretendon.
category: fiscalization
language: sq
keywords:
  - EFS
  - fiskalizim
  - kupon fiskal
  - ATK
  - certifikim
---

Gjuha: [English](../../en/fiscalization/status-and-eligibility.md) | **Shqip**

# Statusi i fiskalizimit dhe EFS

Qendra e tatimeve lexon `kosovo_efs_status`. Kur nuk ka status të pranuar, shfaq **EFS NOT CERTIFIED** dhe paralajmërimin se EFS i prodhimit është i çaktivizuar.

Kjo do të thotë:

- fatura, oferta, pro-fatura, porosia ose fletëdërgesa nuk bëhet automatikisht kupon fiskal vetëm sepse ka PDF;
- domeni ka llojin `FISCAL_RECEIPT`, por kjo nuk dëshmon aktivizimin e EFS-së;
- kodi mobil nuk dëshmon pranim të drejtpërdrejtë nga ATK, QR fiskal të gjeneruar nga shërbimi ose certifikim prodhimi.

Mos shtoni identifikues fiskalë me dorë dhe mos e quani PDF-në e zakonshme kupon fiskal. Për status të pasaktë kontrolloni kompaninë, lejet dhe të dhënën `kosovo_efs_status` me administratorin e autorizuar.

Të lidhura: [Qendra e tatimeve](../taxes/tax-center.md), [Llojet e dokumenteve](../documents/commercial-document-types.md).
