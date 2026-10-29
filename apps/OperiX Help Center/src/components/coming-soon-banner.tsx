import { Mail } from "lucide-react";
import type { Locale } from "../content/types";
import { copy } from "../content/ui";
import { supportMailto } from "../lib/support";


/** Shown above Booking documentation until the product launches. */
export function ComingSoonBanner({ locale }: { locale: Locale }) {
  return <aside className="coming-soon-banner" role="note">
    <span className="status-pill status-soon">{copy(locale, "comingSoonBadge")}</span>
    <div><strong>{copy(locale, "bookingComingSoonTitle")}</strong><p>{copy(locale, "bookingComingSoonText")}</p></div>
    <a className="button-secondary" href={supportMailto(locale === "sq" ? "Lista e pritjes OperiX Booking" : "OperiX Booking waitlist")}><Mail size={16} /> {copy(locale, "joinWaitlist")}</a>
  </aside>;
}
