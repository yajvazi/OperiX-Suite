"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "../content/types";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname() || `/${locale}`;
  const alternateLocale: Locale = locale === "en" ? "sq" : "en";
  const alternatePath = pathname.replace(/^\/(en|sq)(?=\/|$)/, `/${alternateLocale}`);
  return (
    <div className="language-switcher mobile-language-switcher" aria-label="Language">
      <Link className={locale === "en" ? "is-active" : ""} href={pathname.replace(/^\/(en|sq)(?=\/|$)/, "/en")} hrefLang="en">English</Link>
      <span aria-hidden="true">/</span>
      <Link className={locale === "sq" ? "is-active" : ""} href={alternatePath} hrefLang="sq">Shqip</Link>
    </div>
  );
}
