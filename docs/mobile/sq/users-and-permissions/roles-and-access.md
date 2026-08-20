---
title: Rolet, anëtarët dhe qasja
description: Kuptoni Super admin, Admin, Menaxherin, Punonjësin, ftesat dhe lejet e kompanisë.
category: users-and-permissions
language: sq
keywords:
  - role
  - leje
  - super admin
  - admin
  - menaxher
  - punonjës
  - anëtarë
---

Gjuha: [English](../../en/users-and-permissions/roles-and-access.md) | **Shqip**

# Rolet, anëtarët dhe qasja

Modeli i hapësirës së punës ka saktësisht katër role:

- **Super admin** — vetëm pronari i kompanisë dhe i vetmi rol me qasje në OperiX Control;
- **Admin** — administrim i plotë i tenant-it pa qasje në OperiX Control;
- **Menaxher** — administrim operacional për tenant-in e caktuar;
- **Punonjës** — mund të krijojë faturat dhe të gjitha llojet e dokumenteve proforma/komerciale, por nuk mund të ndryshojë ose fshijë faturat, produktet apo regjistrat e tjerë.

Super admin nuk mund të caktohet përmes ftesës ose menusë së roleve; serveri e përcakton nga pronësia e kompanisë.

Në aplikacion, punonjësi nuk sheh veprimet e krijimit për produkte, shpenzime dhe të dhëna të tjera jashtë dokumenteve. Këto janë kufizime të ndërfaqes; RLS dhe RPC-të janë kufiri i sigurisë.

Administratorët e autorizuar menaxhojnë kompaninë, ftesat, rolet, heqjen e anëtarëve dhe arkivimin. Një veprim mund të jetë i dukshëm por të refuzohet në server për mungesë të `sales_invoice.post`, `journal.post`, `roles.manage` ose lejes tjetër.

Të dhënat ndahen sipas kompanisë aktive dhe pasardhësve të lejuar. Nëse qasja duket e pasaktë, kontaktoni administratorin dhe mos u përpiqni ta anashkaloni kufizimin.
