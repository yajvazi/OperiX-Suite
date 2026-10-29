import { LegalPage } from "@/components/legal-page";
import { getCopy, type Lang } from "@/content/copy";
import { pageMetadata } from "@/lib/lang";

const lang: Lang = "en";

export function generateMetadata() {
  const t = getCopy(lang);
  return pageMetadata(lang, "/terms", t.legal.terms.title, t.legal.review);
}

export default function Page() {
  return <LegalPage lang={lang} kind="terms" />;
}
