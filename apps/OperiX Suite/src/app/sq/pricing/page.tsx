import { PricingPage } from "@/components/pricing-page";
import { getCopy, type Lang } from "@/content/copy";
import { pageMetadata } from "@/lib/lang";

const lang: Lang = "sq";

export function generateMetadata() {
  const t = getCopy(lang);
  return pageMetadata(lang, "/pricing", t.nav.pricing, t.pricing.hero.sub);
}

export default function Page() {
  return <PricingPage lang={lang} />;
}
