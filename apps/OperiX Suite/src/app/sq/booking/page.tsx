import { BookingPage } from "@/components/booking-page";
import { getCopy, type Lang } from "@/content/copy";
import { pageMetadata } from "@/lib/lang";

const lang: Lang = "sq";

export function generateMetadata() {
  const t = getCopy(lang);
  return pageMetadata(lang, "/booking", t.nav.booking + " · " + t.comingSoon, t.booking.hero.sub);
}

export default function Page() {
  return <BookingPage lang={lang} />;
}
