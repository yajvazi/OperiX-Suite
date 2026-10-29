import { ContactPage } from "@/components/contact-page";
import { getCopy, type Lang } from "@/content/copy";
import { pageMetadata } from "@/lib/lang";

const lang: Lang = "sq";

export function generateMetadata() {
  const t = getCopy(lang);
  return pageMetadata(lang, "/contact", t.nav.contact, t.contact.hero.sub);
}

export default function Page() {
  return <ContactPage lang={lang} />;
}
