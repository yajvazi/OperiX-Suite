import { SelfHostingPage } from "@/components/self-hosting-page";
import { getCopy, type Lang } from "@/content/copy";
import { pageMetadata } from "@/lib/lang";

const lang: Lang = "sq";

export function generateMetadata() {
  const t = getCopy(lang).selfhosting;
  return pageMetadata(lang, "/self-hosting", t.meta.title, t.meta.description);
}

export default function Page() {
  return <SelfHostingPage lang={lang} />;
}
