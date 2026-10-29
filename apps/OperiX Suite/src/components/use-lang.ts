"use client";

import { usePathname } from "next/navigation";
import type { Lang } from "@/content/copy";

/** The language and the language-free path of the current URL. English lives at the root, Albanian under /sq. */
export function useLang(): { lang: Lang; path: string } {
  const pathname = usePathname() || "/";
  if (pathname === "/sq" || pathname.startsWith("/sq/")) return { lang: "sq", path: pathname.slice(3) || "/" };
  return { lang: "en", path: pathname };
}
