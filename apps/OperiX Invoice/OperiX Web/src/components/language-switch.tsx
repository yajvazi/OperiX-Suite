"use client";

import { useEffect, useState } from "react";
import { getUiLanguage, setUiLanguage, type UiLanguage } from "@/lib/i18n/language";

const LANGUAGES: Array<{ value: UiLanguage; label: string }> = [{ value: "sq", label: "Shqip" }, { value: "en", label: "English" }];

/** Language of the interface. Language names are written in their own language and are never translated. */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const [language, setLanguage] = useState<UiLanguage>("en");
  useEffect(() => { queueMicrotask(() => setLanguage(getUiLanguage())); }, []);
  return <div className={compact ? "flex items-center gap-2 text-xs" : "settings-choice-row mt-3"} role="radiogroup" aria-label="Language" data-no-translate>
    {LANGUAGES.map((item) => <button type="button" role="radio" aria-checked={language === item.value} key={item.value}
      className={compact ? `underline-offset-2 ${language === item.value ? "font-semibold underline" : "muted"}` : `settings-choice ${language === item.value ? "is-active" : ""}`}
      onClick={() => { if (language !== item.value) setUiLanguage(item.value); }}>{item.label}</button>)}
  </div>;
}
