import { HomePage } from "@/components/home-page";
import { getCopy, type Lang } from "@/content/copy";
import { pageMetadata } from "@/lib/lang";

const lang: Lang = "en";

export function generateMetadata() {
  const t = getCopy(lang);
  return pageMetadata(lang, "/", t.meta.title, t.meta.description);
}

export default function Page() {
  return <HomePage lang={lang} />;
}
