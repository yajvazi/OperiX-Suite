import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { ProductIcon, ProductInterface } from "./product-interface";
import { getProduct, getStartedUrl, type ProductKey } from "@/content/products";

export type SolutionPageContent = {
  name: string;
  headline: string;
  description: string;
  products: ProductKey[];
  outcomes: string[];
  workflow: string[];
};

export function SolutionPage({ content }: { content: SolutionPageContent }) {
  return <>
    <section className="solution-page-hero"><div className="container solution-hero-grid"><div><span className="section-label">OperiX {content.name} solution</span><h1>{content.headline}</h1><p>{content.description}</p><div className="button-row"><a href={getStartedUrl} className="button" data-analytics="get_started_clicked">Get started <ArrowRight size={16} /></a><Link href="/demo" className="button button-ghost" data-analytics="demo_clicked">Explore demo <ArrowRight size={16} /></Link></div><div className="solution-hero-facts"><div><strong>{content.products.length}</strong><span>{content.products.length === 1 ? "focused product" : "connected products"}</span></div><div><strong>{content.outcomes.length}</strong><span>ways to improve the work</span></div><div><strong>One</strong><span>account and organization context</span></div></div></div><div className="solution-hero-interface"><ProductInterface variant={content.products[0]} /><div className="solution-hero-built-with"><span>Built around</span><strong>{content.products.map((key) => getProduct(key).shortName).join(" + ")}</strong></div></div></div></section>
    <section className="section solution-products-section"><div className="container"><div className="section-heading"><span className="section-label">The right OperiX apps</span><h2>Bring the pieces together.</h2><p>Each product keeps its own job while the account, organization context, and access model stay connected.</p></div><div className="solution-product-row">{content.products.map((key) => { const product = getProduct(key); return <Link href={product.marketingPath} className="solution-product-pill" key={key}><span style={{ ["--product-accent" as string]: product.accent }}><ProductIcon product={key} size={17} /></span><span><strong>{product.name}</strong><small>{product.navigationDescription}</small></span><ArrowRight size={15} /></Link>; })}</div></div></section>
    <section className="section solution-outcomes-section"><div className="container solution-outcomes-grid"><div><span className="section-label">What changes</span><h2>Less switching. More context.</h2><p>Use a solution view to understand how OperiX can support a business problem without turning every use case into the same product page.</p><div className="solution-outcome-note"><Check size={16} /><span><strong>Designed around the work.</strong> Keep each team in the product that fits while the organization stays connected.</span></div></div><div className="outcome-list">{content.outcomes.map((item, index) => <div key={item}><span>0{index + 1}</span><strong>{item}</strong><Check size={15} /></div>)}</div></div></section>
    <section className="section solution-workflow-section"><div className="container solution-workflow-grid"><div><span className="section-label">A practical starting point</span><h2>Build the workflow around your team.</h2><p>Start small, set the right access, and add products when there is a real operational reason to do so.</p><ul className="check-list">{content.workflow.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul></div><div className="solution-steps">{content.workflow.map((item, index) => <div key={item}><span>0{index + 1}</span><p>{item}</p></div>)}</div></div></section>
    <section className="section final-cta-section"><div className="container final-cta"><div><span className="section-label">Next step</span><h2>Talk through your starting point.</h2><p>We’ll help you understand which OperiX application fits the work you need to organize first.</p></div><div className="button-row"><a href={getStartedUrl} className="button" data-analytics="get_started_clicked">Get started <ArrowRight size={16} /></a><Link href="/contact" className="button button-ghost">Talk to us</Link></div></div></section>
  </>;
}
