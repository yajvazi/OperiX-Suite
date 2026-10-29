import { InvoicePage } from "@/components/invoice-page";
import { getCopy, type Lang } from "@/content/copy";
import { pageMetadata } from "@/lib/lang";

const lang: Lang = "sq";

export function generateMetadata() {
  const t = getCopy(lang);
  return pageMetadata(lang, "/invoice", t.nav.invoice, t.invoice.hero.sub);
}

export default function Page() {
  return <InvoicePage lang={lang} />;
}
