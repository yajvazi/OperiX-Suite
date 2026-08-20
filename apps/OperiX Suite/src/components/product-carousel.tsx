"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { productOrder, productRegistry } from "@/content/products";
import { ProductIcon, ProductInterface } from "@/components/product-interface";

/** Kept for secondary/legacy pages that still use the original carousel entry point. */
export function ProductCarousel() {
  const [start, setStart] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = productOrder.length;
  const visible = 2;

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setStart((value) => (value + 1) % total), 6000);
    return () => window.clearInterval(timer);
  }, [paused, total]);

  const visibleProducts = Array.from({ length: visible }, (_, offset) => productRegistry[productOrder[(start + offset) % total]]);
  const go = (direction: number) => setStart((value) => (value + direction + total) % total);

  return (
    <div className="product-carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <button className="carousel-arrow carousel-arrow-left" type="button" aria-label="Previous products" onClick={() => go(-1)}><ArrowLeft aria-hidden="true" /></button>
      <div className="products-grid carousel-track" aria-live="polite">
        {visibleProducts.map((product) => (
          <article className="product-card" key={product.key}>
            <div className="product-copy">
              <div className="product-card-title"><div className="icon-box product-brand-icon" style={{ ["--product-accent" as string]: product.accent }}><ProductIcon product={product.key} /></div><h3>{product.name}</h3></div>
              <p>{product.description}</p>
              <ul className="feature-bullets">{product.featureGroups[0].items.slice(0, 4).map((feature) => <li key={feature}>{feature}</li>)}</ul>
              <Link className="text-link" href={product.marketingPath}>Learn more <ArrowRight /></Link>
            </div>
            <div className="product-preview"><ProductInterface variant={product.key} compact /></div>
          </article>
        ))}
      </div>
      <button className="carousel-arrow carousel-arrow-right" type="button" aria-label="Next products" onClick={() => go(1)}><ArrowRight aria-hidden="true" /></button>
      <div className="carousel-dots" role="tablist" aria-label="Product slides">
        {productOrder.map((key, index) => <button key={key} type="button" role="tab" aria-label={`Show ${productRegistry[key].name}`} aria-selected={index === start} className={index === start ? "is-active" : ""} onClick={() => setStart(index)} />)}
      </div>
    </div>
  );
}
