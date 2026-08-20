"use client";

import Link from "next/link";
import { ArrowRight, Check, ExternalLink, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { DemoAction } from "./demo-action";
import { ProductIcon, ProductInterface } from "./product-interface";
import { getProduct, getStartedUrl, productOrder, productRegistry, type ProductKey } from "@/content/products";

export function DemoCenter() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("product") as ProductKey | null;
  const [selected, setSelected] = useState<ProductKey>(requested && productRegistry[requested] ? requested : "invoice");
  const product = getProduct(selected);
  const liveDemo = product.demoEnabled && product.demoUrl;

  const whatYouCanExplore = useMemo(() => {
    if (selected === "invoice") return ["Dashboard with fictional EUR activity", "Invoices, customers, vendors, and products", "Create a browser-only sample invoice", "Reset the demo data at any time"];
    if (selected === "control") return ["Organizations, users, roles, and permissions", "App access and security concepts", "Audit and governance workflows", "A future demo will block all platform-sensitive actions"];
    return product.featureGroups.flatMap((group) => group.items).slice(0, 6);
  }, [product, selected]);

  return <div className="demo-center">
    <section className="demo-hero"><div className="container demo-hero-grid"><div><span className="section-label">Public demo center</span><h1>Explore OperiX with safe fictional data.</h1><p>Choose a product to see what is available today. The live Invoice demo requires no account or payment details. Other product demos will only launch when their isolated demo environments are ready.</p><div className="demo-hero-notes"><span><ShieldCheck size={15} />No production organizations</span><span><Check size={15} />Fictional sample data</span><span><Check size={15} />Resettable changes</span></div></div><div className="demo-hero-interface"><ProductInterface variant={selected === "suite" ? "platform" : selected} /></div></div></section>
    <section className="section demo-products-section"><div className="container"><div className="section-heading"><span className="section-label">Choose a product</span><h2>Start where your work starts.</h2><p>Every card is powered by the same product registry as the navigation and product pages.</p></div><div className="demo-product-grid">{productOrder.map((key) => { const item = productRegistry[key]; const Icon = item.icon; return <button type="button" className={`demo-product-card ${selected === key ? "is-selected" : ""}`} key={key} onClick={() => setSelected(key)}><span className="demo-card-icon" style={{ ["--product-accent" as string]: item.accent }}><Icon size={19} /></span><strong>{item.name}</strong><small>{item.navigationDescription}</small><span className={`demo-card-status ${item.demoEnabled ? "is-live" : ""}`}>{item.demoEnabled ? "Live demo" : "Environment preparing"}</span></button>; })}</div></div></section>
    <section className="section demo-launch-section" id="demo-launch"><div className="container demo-launch-grid"><div className="demo-launch-copy"><div className="demo-selected-product"><span className="demo-card-icon" style={{ ["--product-accent" as string]: product.accent }}><ProductIcon product={product.key} size={20} /></span><div><span className="section-label">Selected product</span><h2>{product.name}</h2></div></div><p>{product.demoNote}</p><div className="demo-explore-list">{whatYouCanExplore.map((item) => <span key={item}><Check size={14} />{item}</span>)}</div><div className="button-row">{liveDemo ? <DemoAction product={product.key} /> : <Link className="button" href={`/products/${product.key}`}>Explore {product.shortName} <ArrowRight size={16} /></Link>}<a className="button button-ghost" href={getStartedUrl} data-analytics="demo_get_started_clicked">Create workspace <ArrowRight size={15} /></a></div>{liveDemo ? <p className="demo-live-note"><ExternalLink size={13} /> Launches the existing public OperiX Invoice demo in a separate tab.</p> : <p className="demo-live-note">The product page remains available for a detailed walkthrough while the safe public demo environment is prepared.</p>}</div><div className="demo-launch-aside"><span className="demo-aside-label">Demo guardrails</span><h3>Designed to stay on the safe side.</h3><ul><li>No real payments, refunds, email, SMS, or external messages</li><li>No production webhooks, integrations, secrets, or API keys</li><li>No access to real customer organizations</li><li>Temporary changes are isolated and resettable</li></ul><Link href="/resources#demo-safety" className="text-link">Read demo safety notes <ArrowRight size={14} /></Link></div></div></section>
  </div>;
}
