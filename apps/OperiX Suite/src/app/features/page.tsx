import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { ProductIcon } from "@/components/product-interface";
import { productOrder, productRegistry } from "@/content/products";

export const metadata: Metadata = {
  title: "Features",
  description: "Explore the connected OperiX product ecosystem for finance, people, bookings, workplaces, and platform administration.",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return (
    <>
      <PageHero title="The tools behind a connected operation." description="Explore the OperiX applications that bring finance, people, bookings, workplaces, and administration into one platform." />
      <section className="section">
        <div className="container feature-overview-grid">
          {productOrder.map((key) => {
            const product = productRegistry[key];
            return <article className="feature-overview-card" key={key}>
              <span className="icon-box" style={{ ["--product-accent" as string]: product.accent }}><ProductIcon product={key} /></span>
              <span className="section-label">{product.hasMobile ? "Web + mobile" : "Web application"}</span>
              <h2>{product.name}</h2>
              <p>{product.description}</p>
              <ul className="feature-bullets">{product.featureGroups.flatMap((group) => group.items).slice(0, 5).map((feature) => <li key={feature}>{feature}</li>)}</ul>
              <Link className="text-link" href={product.marketingPath}>Explore {product.shortName} <ArrowRight size={15} /></Link>
            </article>;
          })}
        </div>
      </section>
    </>
  );
}
