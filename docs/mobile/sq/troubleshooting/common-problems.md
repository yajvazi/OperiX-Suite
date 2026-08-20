---
title: Zgjidhja e problemeve të zakonshme
description: Diagnostikoni problemet e hyrjes, ruajtjes, totalit, PDF-së, pagesës, sinkronizimit dhe lejeve.
category: troubleshooting
language: sq
keywords:
  - zgjidhja e problemeve
  - nuk ruhet fatura
  - gabim PDF
  - sinkronizim
  - qasje e refuzuar
---

Gjuha: [English](../../en/troubleshooting/common-problems.md) | **Shqip**

# Zgjidhja e problemeve të zakonshme

## Nuk mund të hyj

Kontrolloni emailin dhe fjalëkalimin, lidhjen, verifikimin me OTP dhe rinisni aplikacionin. Për Google provoni përsëri rrjedhën në shfletues. Në kod nuk u gjet rivendosje fjalëkalimi; kontaktoni mbështetjen.

## Llogaria është në pritje

Administratori duhet të miratojë punonjësin. Shtypni **Check status**, pastaj rinisni ose dilni/hyni përsëri nëse navigimi nuk ndryshon.

## Fatura nuk ruhet

Kontrolloni që ka rresht, kompani aktive, klient kur kërkohet, vlera numerike dhe leje. Provoni vetëm një herë dhe kontrolloni listën para se të ripërsëritni një veprim postimi.

## Klienti ose produkti mungon

Rifreskoni, kontrolloni kompaninë aktive dhe filtrin/kërkimin. Të dhënat janë të kufizuara sipas hapësirës dhe mund të jenë ruajtur në kompani tjetër.

## Totali/TVSH-ja nuk përputhet

Kontrolloni sasinë, çmimin, zbritjen, normën dhe nëse çmimi përfshin tatimin. Formulari aplikon tatimin mbi vlerën pas zbritjes. Mos ndryshoni dokument të lëshuar për të detyruar totalin.

## PDF-ja nuk krijohet/shpërndahet

Kontrolloni kompaninë dhe rreshtat, hapësirën e pajisjes dhe lidhjen. Për email duhet emaili i klientit. Kompozimi nuk dëshmon dërgimin.

## Statusi i pagesës është i gabuar

Kontrolloni faturën dhe listën e pagesave. Pagesa postohet dhe alokohet veçmas; mund të ekzistojë pagesa ndërsa fatura mbetet e papaguar nëse alokimi dështoi.

## Probleme offline/sinkronizimi

Aplikacioni përdor kërkime live në Supabase; vetëm gjuha/tema ruhen lokalisht dhe shporta e mbajtur në POS mund të humbet. Rilidhuni, rifreskoni dhe kontrolloni në kompaninë aktive.

## Leja u refuzua

Kërkoni administratorin të kontrollojë anëtarësimin, rolin, kompaninë dhe lejen e backend-it. Mos u përpiqni të anashkaloni lejet nga ndërfaqja.

## Paralajmërim EFS

**EFS NOT CERTIFIED** do të thotë se nuk ka status të pranuar në ekran. PDF-ja e zakonshme nuk është automatikisht kupon fiskal.

## Aplikacioni mbyllet

Riniseni, shënoni versionin, platformën, rrugën dhe veprimin e fundit. Para dërgimit të log-eve hiqni tokenat, fjalëkalimet dhe çelësat privatë.
