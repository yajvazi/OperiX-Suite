"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { products } from "@/content/site";
import { DashboardMockup } from "@/components/product-mockup";
import { Reveal } from "@/components/motion";
import { useEffect, useState } from "react";

export function ProductCarousel() {
  const [start, setStart] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = products.length;
  const visible = 2;

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setStart((value) => (value + 1) % total), 6000);
    return () => window.clearInterval(timer);
  }, [paused, total]);

  const visibleProducts = Array.from({ length: visible }, (_, offset) => products[(start + offset) % total]);
  const go = (direction: number) => setStart((value) => (value + direction + total) % total);

  return (
    <div className="product-carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <button className="carousel-arrow carousel-arrow-left" type="button" aria-label="Previous products" onClick={() => go(-1)}><ArrowLeft aria-hidden="true" /></button>
      <div className="products-grid carousel-track" aria-live="polite">
        {visibleProducts.map((product, offset) => {
          const index = (start + offset) % total;
          const ProductIcon = product.icon;
          return (
            <Reveal key={`${product.name}-${index}`} delay={offset * .06}>
              <article className="product-card">
                <div className="product-copy">
                  <div className="product-card-title"><div className="icon-box product-brand-icon">{product.logo ? <Image src={product.logo} width={34} height={34} alt="" aria-hidden="true" /> : <ProductIcon aria-hidden="true" />}</div><h3>{product.name}</h3>{product.comingSoon ? <span className="product-status">Coming soon</span> : null}</div>
                  <p>{product.description}</p>
                  <ul className="feature-bullets">{product.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                  {product.comingSoon ? <span className="text-link product-coming-soon">Coming soon</span> : <Link className="text-link" href={product.href}>Learn more <ArrowRight /></Link>}
                </div>
                <div className="product-preview"><DashboardMockup variant={product.name.includes("Desk") ? "desk" : product.name.includes("Booking") ? "booking" : product.name.includes("Control") ? "control" : index === 0 ? "invoice" : "hr"} /></div>
              </article>
            </Reveal>
          );
        })}
      </div>
      <button className="carousel-arrow carousel-arrow-right" type="button" aria-label="Next products" onClick={() => go(1)}><ArrowRight aria-hidden="true" /></button>
      <div className="carousel-dots" role="tablist" aria-label="Product slides">
        {products.map((product, index) => <button key={product.name} type="button" role="tab" aria-label={`Show ${product.name}`} aria-selected={index === start} className={index === start ? "is-active" : ""} onClick={() => setStart(index)} />)}
      </div>
    </div>
  );
}
