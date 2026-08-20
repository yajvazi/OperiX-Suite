import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { DemoAction } from "./demo-action";
import { FAQList } from "./faq";
import { MobileAvailability, PlatformInterface, ProductIcon, ProductShowcase } from "./product-interface";
import { getStartedUrl, getProduct, type ProductKey } from "@/content/products";

export type ProductPageContent = {
  product: ProductKey;
  headline: string;
  description: string;
  overview: string;
  workflow: string[];
  useCases: string[];
  mobileCopy: string;
};

export function ProductPage({ content }: { content: ProductPageContent }) {
  const product = getProduct(content.product);
  if (!product) return null;
  const Icon = product.icon;
  const featureCount = product.featureGroups.reduce((total, group) => total + group.items.length, 0);

  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: product.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: product.hasMobile ? "Web, iOS, Android" : "Web",
    description: product.description,
    url: `https://operixsuite.com${product.marketingPath}`,
    brand: { "@type": "Brand", name: "OperiX" },
  };

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <section className={`product-page-hero product-hero-${product.key}`} style={{ ["--product-accent" as string]: product.accent }}>
      <div className="container product-hero-layout">
        <div className="product-hero-copy">
          <div className="product-kicker"><span className="product-kicker-icon" style={{ ["--product-accent" as string]: product.accent }}><Icon size={16} /></span>{product.name}</div>
          <h1>{content.headline}</h1>
          <p>{content.description}</p>
          <div className="button-row"><a className="button" href={getStartedUrl} data-analytics="get_started_clicked">Get started <ArrowRight size={16} /></a><DemoAction product={product.key} secondary /></div>
          <div className="product-hero-foot"><span><Check size={14} />One OperiX account</span><span><Check size={14} />{product.hasMobile ? "Web + mobile access" : "Web application"}</span></div>
          <div className="product-hero-facts"><div><strong>{product.featureGroups.length}</strong><span>focus areas</span></div><div><strong>{featureCount}</strong><span>core capabilities</span></div><div><strong>{product.hasMobile ? "Web + mobile" : "Web"}</strong><span>access model</span></div></div>
        </div>
        <div className="product-hero-visual"><ProductShowcase product={product.key} /></div>
      </div>
    </section>

    <section className="section product-overview-section"><div className="container product-overview-grid"><div className="product-overview-copy"><span className="section-label">Built around the work</span><h2>{content.overview}</h2><p>{product.description} Each product keeps its own focused workflows while staying connected to your OperiX account and organization context.</p><ul className="check-list">{content.workflow.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul></div><div className="product-overview-aside"><div className="product-aside-icon" style={{ ["--product-accent" as string]: product.accent }}><Icon size={22} /></div><strong>{product.name} stays focused.</strong><p>Connected does not mean every app becomes the same app. OperiX keeps the right tools in the right workspace.</p></div></div></section>

    <section className="section product-features-section"><div className="container"><div className="section-heading"><span className="section-label">What you can explore</span><h2>Tools for the work your team already does.</h2><p>Current product areas are represented from the existing OperiX application structure and stay scoped to this product.</p></div><div className="product-feature-groups">{product.featureGroups.map((group) => <div className="feature-group-row" key={group.title}><div><span className="feature-group-mark" style={{ ["--product-accent" as string]: product.accent }}><ProductIcon product={product.key} size={16} /></span><h3>{group.title}</h3></div><ul>{group.items.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul></div>)}</div></div></section>

    <section className="section product-workflow-section"><div className="container"><div className="section-heading"><span className="section-label">How it fits together</span><h2>A clear path from setup to everyday work.</h2><p>Use the product in the order your team needs it, then connect the surrounding OperiX applications as your organization grows.</p></div><div className="product-workflow-grid">{content.workflow.map((step, index) => <div className="product-workflow-step" key={step}><span className="product-workflow-number">0{index + 1}</span><div><strong>{step}</strong><p>{index === 0 ? "Start with the foundation your team needs." : index === content.workflow.length - 1 ? "Keep the work visible and ready for the next decision." : "Keep the activity connected to the people and context around it."}</p></div></div>)}</div></div></section>

    {content.useCases.length ? <section className="section product-use-case-section"><div className="container use-case-grid"><div><span className="section-label">Where it fits</span><h2>Useful across the workflows that matter.</h2><p>Start with the parts of the operation this product is designed to support, then connect it to the rest of OperiX when you are ready.</p></div><div className="use-case-list">{content.useCases.map((useCase, index) => <div key={useCase}><span>0{index + 1}</span><strong>{useCase}</strong><ArrowRight size={15} /></div>)}</div></div></section> : null}

    <section className="section product-mobile-section"><div className="container mobile-section-grid"><div><span className="section-label">{product.hasMobile ? "Web and mobile" : "Web application"}</span><h2>{product.hasMobile ? "Work where the day takes you." : "A focused experience in the browser."}</h2><p>{content.mobileCopy}</p><MobileAvailability showMobile={product.hasMobile} /></div><div className="mobile-showcase">{product.hasMobile ? <ProductShowcase product={product.key} /> : <div className="web-only-note"><span className="product-aside-icon"><Icon size={22} /></span><strong>{product.name} is web-only.</strong><p>Administrators and workspace owners can use the full experience from a browser while the App Launcher keeps the wider OperiX ecosystem close.</p></div>}</div></div></section>

    <section className="section product-connected-section"><div className="container connected-product-grid"><div><span className="section-label">Part of OperiX</span><h2>Connected by account, organization, and access.</h2><p>{product.name} works as part of the wider OperiX ecosystem. Authorized users can move through the App Launcher and keep their organization context consistent.</p><div className="button-row"><Link href="/products/suite" className="button button-ghost">Explore Suite <ArrowRight size={15} /></Link>{product.key !== "control" ? <Link href="/products/control" className="button button-ghost">See Control <ArrowRight size={15} /></Link> : null}</div></div><div className="connected-product-visual"><PlatformInterface /></div></div></section>

    <section className="section product-demo-section"><div className="container demo-product-band"><div><span className="section-label">Interactive demo</span><h2>See {product.name} in context.</h2><p>{product.demoEnabled ? "Explore the public Invoice demo with fictional sample data. Changes stay in the demo and can be reset." : "This product demo is being prepared as a restricted environment. It will use fictional data and never grant access to production organizations."}</p></div><div className="button-row"><DemoAction product={product.key} /><a className="button button-ghost" href={getStartedUrl} data-analytics="demo_get_started_clicked">Create a workspace <ArrowRight size={15} /></a></div></div></section>

    <section className="section product-security-section"><div className="container product-security-grid"><div><span className="section-label">Platform security</span><h2>Clear access for every product.</h2><p>OperiX products are connected through shared account and organization context. Control is the administrative layer for application access, permissions, security, and audit visibility.</p></div><div className="security-callout"><ShieldCheck size={24} /><strong>One account, the right access.</strong><span>Control remains web-only and always keeps the App Launcher available for authorized users.</span></div></div></section>

    <section className="section product-faq-section"><div className="container narrow-container"><div className="section-heading"><span className="section-label">Questions</span><h2>Before you get started.</h2></div><FAQList limit={4} /></div></section>

    <section className="section final-cta-section"><div className="container final-cta"><div><span className="section-label">Ready when you are</span><h2>Start with the work in front of you.</h2><p>Use one account today and add the OperiX applications your organization needs next.</p></div><a href={getStartedUrl} className="button" data-analytics="get_started_clicked">Get started <ArrowRight size={16} /></a></div></section>
  </>;
}
