import type { Metadata } from "next";
import { FAQList } from "@/components/faq";
import { PageHero } from "@/components/page-hero";
import { PricingGrid } from "@/components/pricing";
import { Reveal } from "@/components/motion";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Explore OperiX Suite plan structure and contact the team for current pricing.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <>
      <PageHero title="Pricing that can grow with your business." description="Final plan pricing is being prepared. Talk with us about the right starting point for your team." />
      <section className="section"><div className="container"><PricingGrid /></div></section>
      <section className="section testimonials-section">
        <div className="container">
          <Reveal className="section-heading centered"><span className="eyebrow">Pricing FAQ</span><h2>Plan with confidence</h2></Reveal>
          <FAQList limit={5} />
        </div>
      </section>
    </>
  );
}
