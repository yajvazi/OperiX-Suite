---
title: Hyrja, regjistrimi dhe bashkimi në ekip
description: Mësoni si funksionojnë autentikimi, verifikimi i emailit, hyrja me Google dhe ftesat në ekip.
category: getting-started
language: sq
keywords:
  - hyrje
  - regjistrim
  - verifikim emaili
  - Google
  - bashkohu në ekip
---

Gjuha: [English](../../en/getting-started/sign-in-and-account.md) | **Shqip**

# Hyrja, regjistrimi dhe bashkimi në ekip

## Hyrja

1. Hapni OperiX Invoice Mobile.
2. Te **Sign In**, shkruani emailin dhe fjalëkalimin.
3. Shtypni **Sign In**.
4. Pas hyrjes, aplikacioni ngarkon hapësirën e zgjedhur të punës.

Ekrani ka edhe hyrjen me Google. Kjo hap shfletuesin për autentikim dhe kthehet në aplikacion përmes ridrejtimit të konfiguruar.

## Regjistrimi

1. Shtypni **Sign Up**.
2. Plotësoni emrin, mbiemrin, emailin, fjalëkalimin, konfirmimin e tij dhe telefonin.
3. Nëse dëshironi, plotësoni emrin e kompanisë dhe numrin e regjistrimit.
4. Dërgoni formularin.
5. Vendosni kodin e verifikimit të emailit.

Formulari kontrollon fushat e detyrueshme, përputhjen e fjalëkalimeve dhe minimumin e fjalëkalimit të implementuar në ekran. Llogaria krijohet përmes Supabase Auth.

## Bashkimi në një kompani ekzistuese

1. Hapni rrjedhën e ftesës nga regjistrimi.
2. Shkruani tokenin e ftesës.
3. Konfirmoni kompaninë e verifikuar.
4. Plotësoni emrin, emailin dhe fjalëkalimin.
5. Dërgoni kërkesën.

Mund të shfaqet ekrani i pritjes për miratim. Administratori duhet të përfundojë qasjen. **Check status** kërkon të dhënat e punonjësit; navigimi aktual mund të kërkojë rinisje ose hyrje të re pas miratimit.

## Sesioni dhe dalja

Supabase rikthen sesionin në nisje dhe dëgjon ndryshimet e autentikimit. Për të dalë, hapni **More > Settings** ose **More > Sign out**, konfirmoni dhe kthehuni në ekranin e autentikimit.

## Kyçja biometrike

Nëse aktivizohet te [Preferencat dhe modelet](../settings/preferences-and-templates.md), aplikacioni kërkon biometrinë ose kodin e pajisjes para ekraneve të autentikuara. Kjo nuk zëvendëson fjalëkalimin ose rikuperimin e llogarisë.

## Funksion që nuk është i ekspozuar

Në kodin mobil nuk u gjet ekran për rivendosjen e fjalëkalimit. Për ndihmë, kontaktoni administratorin ose [Mbështetjen](../settings/help-and-about.md).
