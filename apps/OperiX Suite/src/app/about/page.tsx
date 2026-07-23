import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/motion";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about the mission, vision, and product direction behind OperiX.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <PageHero title="Business software should bring clarity." description="OperiX is building a focused product family for the financial and people operations that keep growing businesses moving." />
      <section className="section">
        <div className="container mission-grid">
          <Reveal className="mission-card"><span className="eyebrow">Mission</span><h2>Make everyday operations easier to understand.</h2><p>We design tools that turn scattered business work into clear workflows, reliable records, and useful context.</p></Reveal>
          <Reveal className="mission-card" delay={.08}><span className="eyebrow">Vision</span><h2>One coherent system for running a business.</h2><p>Our long-term direction is a connected suite that grows with the people and processes behind each company.</p></Reveal>
        </div>
      </section>
      <section className="section testimonials-section">
        <div className="container">
          <Reveal className="section-heading centered"><span className="eyebrow">Our story</span><h2>Built one real workflow at a time</h2><p>OperiX has evolved from focused mobile products into a broader platform for connected business operations.</p></Reveal>
          <div className="timeline">
            <Reveal className="timeline-item"><h3>Start with the daily work</h3><p>OperiX Invoice and OperiX HR Office were shaped around practical workflows such as invoicing, employee records, attendance, and payroll.</p></Reveal>
            <Reveal className="timeline-item"><h3>Connect the experience</h3><p>Shared brand, authentication, data foundations, and interface patterns create a more consistent product family.</p></Reveal>
            <Reveal className="timeline-item"><h3>Grow into a suite</h3><p>The next chapter brings products together under one clear OperiX experience while keeping each workflow focused.</p></Reveal>
          </div>
        </div>
      </section>
      <section className="section section-compact"><div className="container"><Reveal className="cta-band"><div><h2>Help shape what comes next</h2><p>Tell us what your business needs from its operational software.</p></div><div className="button-row"><Link href="/contact" className="button">Talk to OperiX</Link></div></Reveal></div></section>
    </>
  );
}
