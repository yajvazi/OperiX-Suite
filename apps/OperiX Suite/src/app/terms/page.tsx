import type { Metadata } from "next";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = { title: "Terms", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <>
      <PageHero title="Terms" description="Approved terms of use will be published here before the OperiX Suite site launches." />
      <section className="section"><article className="container legal-copy"><p>This page is reserved for reviewed legal copy. Product availability, pricing, trials, subscriptions, account responsibilities, acceptable use, support, liability, and governing law must be confirmed before launch.</p><h2>Product information</h2><p>Marketing descriptions on this site explain the intended product experience and do not replace the final commercial agreement.</p></article></section>
    </>
  );
}
