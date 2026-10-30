"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "../content/types";
import { copy } from "../content/ui";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname() || `/${locale}`;
  // Same page in the other language; a path with no language prefix gets one.
  const pathFor = (target: Locale) => /^\/(en|sq)(?=\/|$)/.test(pathname)
    ? pathname.replace(/^\/(en|sq)(?=\/|$)/, `/${target}`)
    : `/${target}${pathname === "/" ? "" : pathname}`;
  return (
    <div className="language-switcher mobile-language-switcher" aria-label={copy(locale, "languageLabel")}>
      <Link className={locale === "en" ? "is-active" : ""} href={pathFor("en")} hrefLang="en">English</Link>
      <span aria-hidden="true">/</span>
      <Link className={locale === "sq" ? "is-active" : ""} href={pathFor("sq")} hrefLang="sq">Shqip</Link>
    </div>
  );
}
