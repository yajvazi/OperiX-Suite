import { Download, ExternalLink, Smartphone } from "lucide-react";
import Link from "next/link";
import { InvoiceLogo } from "@/components/product-logo";
import {
  buildInvoiceMobileLinks,
  getInvoiceMobileStoreUrls,
  targetFromInvoiceMobilePath,
} from "@/lib/mobile-app-links";

export const dynamic = "force-dynamic";

export default async function MobileAppOpenPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const route = await params;
  const path = route.path || [];
  const target = targetFromInvoiceMobilePath(`/open/${path.join("/")}`);
  const links = buildInvoiceMobileLinks(target);
  const stores = getInvoiceMobileStoreUrls();
  return <main className="mobile-app-open-page">
    <section className="mobile-app-open-card" aria-labelledby="mobile-app-open-title">
      <div className="mobile-app-open-brand"><InvoiceLogo /></div>
      <div className="mobile-app-open-icon" aria-hidden="true"><Smartphone size={26} /></div>
      <h1 id="mobile-app-open-title">Open OperiX Invoice</h1>
      <p>{target ? `Continue to your ${target.entity} in the OperiX Invoice mobile app.` : "Continue in the OperiX Invoice mobile app."}</p>
      <a className="btn btn-primary mobile-app-open-action" href={links.schemeUrl}><ExternalLink size={16} aria-hidden="true" /> Open the installed app</a>
      {stores.ios ? <a className="btn mobile-app-open-action" href={stores.ios}><Download size={16} aria-hidden="true" /> Download for iPhone</a> : null}
      {stores.android ? <a className="btn mobile-app-open-action" href={stores.android}><Download size={16} aria-hidden="true" /> Download for Android</a> : null}
      {!stores.ios && !stores.android ? <p className="mobile-app-open-note">The app-store link for this platform is not configured yet. You can return to the previous page or sign in in the browser.</p> : null}
      <Link className="mobile-app-open-browser-link" href="/login">Continue in browser</Link>
    </section>
  </main>;
}
