export type UiLanguage = "en" | "sq";
const KEY = "operix.uiLanguage";

/** The language of the interface: the saved choice, otherwise Albanian for Albanian browsers and English for the rest. */
export function getUiLanguage(): UiLanguage {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "sq" || saved === "en") return saved;
  } catch { /* fall through to the browser language */ }
  return typeof navigator !== "undefined" && /^sq\b/i.test(navigator.language || "") ? "sq" : "en";
}

export function setUiLanguage(language: UiLanguage) {
  try { window.localStorage.setItem(KEY, language); } catch { /* the choice just is not remembered */ }
  window.location.reload();
}
