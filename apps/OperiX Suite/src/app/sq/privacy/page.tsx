import { LegalPage } from "@/components/legal-page";
import { getCopy, type Lang } from "@/content/copy";
import { pageMetadata } from "@/lib/lang";

const lang: Lang = "sq";

export function generateMetadata() {
  const t = getCopy(lang);
  return pageMetadata(lang, "/privacy", t.legal.privacy.title, t.legal.review);
}

export default function Page() {
  return <LegalPage lang={lang} kind="privacy" />;
}
