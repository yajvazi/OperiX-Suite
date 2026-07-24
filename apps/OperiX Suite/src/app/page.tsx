import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  FileText,
  Gauge,
  Layers3,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { FAQList } from "@/components/faq";
import { Float, Reveal } from "@/components/motion";
import { DashboardMockup, PhoneMockup } from "@/components/product-mockup";
import { ProductCarousel } from "@/components/product-carousel";
import { PricingGrid } from "@/components/pricing";
import { benefits, resources, trustItems } from "@/content/site";

export default function HomePage() {
  return (
    <>
      <section className="home-hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <Reveal>
              <h1>One Suite.<br />Complete Control.</h1>
              <p>Bring invoicing, people operations, reporting, and everyday business management into one connected workspace.</p>
              <div className="button-row">
                <Link href="#products" className="button">Explore Products <ArrowRight /></Link>
                <Link href="/book-demo" className="button button-secondary">Book Demo</Link>
              </div>
            </Reveal>
          </div>
          <div className="hero-visual">
            <Reveal className="hero-dashboard" delay={0.08}>
              <DashboardMockup />
            </Reveal>
            <Float className="hero-phone"><PhoneMockup /></Float>
            <Float className="floating-card floating-top" reverse>
              <strong>Clear reporting</strong><span>Decision-ready insights</span>
            </Float>
            <Float className="floating-card floating-bottom">
              <strong>One connected view</strong><span>Finance and people operations</span>
            </Float>
          </div>
        </div>
      </section>

      <section className="trust-section" aria-labelledby="trust-heading">
        <div className="container">
          <h2 id="trust-heading" className="trust-title">Trusted foundations for growing businesses</h2>
          <div className="trust-grid">
            {trustItems.map((item) => {
              const Icon = item.icon;
              return <div className="trust-item" key={item.title}><Icon aria-hidden="true" /><div><strong>{item.title}</strong><span>{item.text}</span></div></div>;
            })}
          </div>
        </div>
      </section>

      <section className="section" id="products">
        <div className="container">
          <Reveal className="section-heading centered">
            <span className="eyebrow">OperiX products</span>
            <h2>Five focused products.<br />One clear experience.</h2>
            <p>Choose the workspace your business needs today, with a product family designed to work together.</p>
          </Reveal>
          <ProductCarousel />
        </div>
      </section>

      <section className="section suite-connection-section" aria-labelledby="suite-connection-title">
        <div className="container suite-connection-grid">
          <Reveal className="suite-connection-copy">
            <span className="eyebrow">OperiX Control</span>
            <h2 id="suite-connection-title">One command center for your entire suite.</h2>
            <p>OperiX Control brings every OperiX product into one clear view, giving leaders the context, controls, and insight to run the whole operation from one place.</p>
            <div className="suite-connection-points">
              <div><div className="icon-box"><Layers3 /></div><span><strong>Unified command center</strong>See revenue, people, bookings, and workspace activity together.</span></div>
              <div><div className="icon-box"><RefreshCw /></div><span><strong>Live operational insight</strong>Updates flow into Control as work happens across the suite.</span></div>
              <div><div className="icon-box"><ShieldCheck /></div><span><strong>Centralized governance</strong>Manage access, settings, and shared context from one secure place.</span></div>
            </div>
          </Reveal>
          <Reveal className="suite-connection-map" delay={.08}>
            <div className="connection-orbit orbit-one" /><div className="connection-orbit orbit-two" />
            <div className="connection-core"><Image src="/brand/operix-x-mark.svg" width={58} height={58} alt="OperiX Suite" /></div>
            <div className="connection-node connection-invoice"><FileText /><span>Invoice</span></div>
            <div className="connection-node connection-hr"><Users /><span>HR Office</span></div>
            <div className="connection-node connection-booking"><CalendarDays /><span>Booking</span></div>
            <div className="connection-node connection-desk"><Building2 /><span>Desk</span></div>
            <div className="connection-node connection-control"><Gauge /><span>Control</span></div>
          </Reveal>
        </div>
      </section>

      <section className="benefits-section">
        <div className="container">
          <Reveal className="section-heading centered">
            <h2>Everything You Need to Run Your Business</h2>
            <p>A connected operational foundation—clear enough for today and ready for what comes next.</p>
          </Reveal>
          <div className="benefits-grid">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return <Reveal className="benefit-item" key={benefit.title} delay={(index % 3) * .05}><Icon aria-hidden="true" /><h3>{benefit.title}</h3><p>{benefit.text}</p></Reveal>;
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container editorial-grid">
          <Reveal>
            <span className="eyebrow">Built for modern teams</span>
            <h2>Less switching.<br />More clarity.</h2>
            <p>OperiX brings the work that keeps your business moving into focused, consistent products your team can understand.</p>
            <div className="editorial-list">
              {[
                [Layers3, "Unified workspace", "A consistent system across financial and people operations."],
                [Sparkles, "Intentional design", "Clear interfaces built around everyday work."],
                [PlugZap, "Connected foundations", "Shared operational context wherever it adds value."],
              ].map(([Icon, title, text]) => {
                const Component = Icon as typeof Layers3;
                return <div className="editorial-item" key={String(title)}><div className="icon-box"><Component /></div><div><h3>{String(title)}</h3><p>{String(text)}</p></div></div>;
              })}
            </div>
            <Link href="/features" className="text-link">Explore all features <ArrowRight /></Link>
          </Reveal>
          <Reveal className="integration-panel" delay={.08}>
            <div className="integration-core"><Image src="/brand/operix-x-mark.svg" width={72} height={72} alt="OperiX connected suite" /></div>
            <div className="integration-node node-1"><FileText /> Invoicing</div>
            <div className="integration-node node-2"><Users /> People</div>
            <div className="integration-node node-3"><BarChart3 /> Reports</div>
            <div className="integration-node node-4"><PlugZap /> Workflows</div>
          </Reveal>
        </div>
      </section>

      <section className="section testimonials-section">
        <div className="container">
          <Reveal className="section-heading centered"><span className="eyebrow">Customer stories</span><h2>Built to support real work</h2><p>Verified customer stories will appear here as the OperiX community grows.</p></Reveal>
          <div className="testimonial-grid">
            {["A clearer view of financial work.", "People operations without the busywork.", "One product family our team can grow into."].map((quote, index) => (
              <Reveal key={quote} delay={index * .06}><article className="testimonial-card"><blockquote>“{quote}”</blockquote><footer><strong>Customer story</strong>Reserved for a verified OperiX customer</footer></article></Reveal>
            ))}
          </div>
          <p className="placeholder-note">Placeholder testimonials are intentionally labeled and do not represent customer endorsements.</p>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="container">
          <Reveal className="section-heading centered"><span className="eyebrow">Pricing</span><h2>Start with what your business needs</h2><p>Final pricing is being prepared. Talk with us about the right product and rollout for your team.</p></Reveal>
          <PricingGrid />
        </div>
      </section>

      <section className="section section-compact">
        <div className="container">
          <Reveal className="section-heading centered"><span className="eyebrow">FAQ</span><h2>Questions, answered</h2></Reveal>
          <FAQList limit={5} />
        </div>
      </section>

      <section className="section section-compact">
        <div className="container">
          <Reveal className="section-heading centered"><span className="eyebrow">Resources</span><h2>Explore OperiX at your pace</h2><p>Product references, guides, and support material will live in one focused resource center.</p></Reveal>
          <div className="resource-grid">
            {resources.slice(0, 3).map((resource, index) => {
              const Icon = resource.icon;
              return <Reveal key={resource.title} delay={index * .06}><article className="resource-card"><div className="icon-box"><Icon /></div><div><h2>{resource.title}</h2><p>{resource.description}</p><span>{resource.status}</span></div></article></Reveal>;
            })}
          </div>
        </div>
      </section>

      <section className="section section-compact">
        <div className="container">
          <Reveal className="cta-band">
            <div><h2>Ready to bring your operation into focus?</h2><p>Explore OperiX Invoice and OperiX HR Office with a guided walkthrough.</p></div>
            <div className="button-row"><Link href="/book-demo" className="button">Book a Demo</Link><Link href="/contact" className="button button-secondary">Contact Us</Link></div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
