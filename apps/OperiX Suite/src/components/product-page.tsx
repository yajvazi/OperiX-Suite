import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, type LucideIcon } from "lucide-react";
import { Reveal } from "./motion";
import { DashboardMockup, PhoneMockup } from "./product-mockup";

export function ProductPage({
  product,
  headline,
  description,
  variant,
  overviewTitle,
  overviewText,
  overviewPoints,
  featureTitle,
  features,
}: {
  product: string;
  headline: string;
  description: string;
  variant: "invoice" | "hr";
  overviewTitle: string;
  overviewText: string;
  overviewPoints: string[];
  featureTitle: string;
  features: { title: string; description: string; icon: LucideIcon }[];
}) {
  return (
    <>
      <section className="page-hero">
        <div className="page-hero-glow" />
        <div className="container product-hero-grid">
          <Reveal>
            <span className="eyebrow product-eyebrow"><Image src={variant === "hr" ? "/brand/operix-hr-office-logo.svg" : "/brand/operix-invoice-logo.svg"} width={28} height={28} alt="" aria-hidden="true" />{product}</span>
            <h1>{headline}</h1>
            <p>{description}</p>
            <div className="button-row"><Link href="/book-demo" className="button">Book a demo <ArrowRight /></Link><Link href="/contact" className="button button-secondary">Contact us</Link></div>
          </Reveal>
          <Reveal className="product-hero-media" delay={.08}><DashboardMockup variant={variant} /><PhoneMockup variant={variant} /></Reveal>
        </div>
      </section>
      <section className="section">
        <div className="container split-section">
          <Reveal className="split-copy">
            <span className="eyebrow">Overview</span>
            <h2>{overviewTitle}</h2>
            <p>{overviewText}</p>
            <ul className="check-list">{overviewPoints.map((point) => <li key={point}><Check aria-hidden="true" />{point}</li>)}</ul>
          </Reveal>
          <Reveal delay={.08}><DashboardMockup variant={variant} /></Reveal>
        </div>
      </section>
      <section className="section testimonials-section">
        <div className="container">
          <Reveal className="section-heading centered"><span className="eyebrow">Capabilities</span><h2>{featureTitle}</h2><p>Purpose-built tools, organized around the work your team already does.</p></Reveal>
          <div className="feature-cards">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return <Reveal key={feature.title} delay={(index % 4) * .05}><article className="feature-card"><div className="icon-box"><Icon /></div><h3>{feature.title}</h3><p>{feature.description}</p></article></Reveal>;
            })}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <Reveal className="cta-band">
            <div><h2>See {product} in action</h2><p>Walk through the workflows that matter most to your business.</p></div>
            <div className="button-row"><Link href="/book-demo" className="button">Book a Demo</Link></div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
