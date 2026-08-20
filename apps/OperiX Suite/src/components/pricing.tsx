"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { pricingPlans } from "@/content/site";

export function PricingGrid() {
  return (
    <>
      <div className="pricing-grid">
        {pricingPlans.map((plan) => (
          <article className={`pricing-card ${plan.featured ? "featured" : ""}`} key={plan.name}>
            {plan.featured && <span className="plan-label">Recommended</span>}
            <h2>{plan.name}</h2>
            <p>{plan.description}</p>
            <div className="price">
              <strong>{plan.price}</strong>
            </div>
            <p className="pricing-note">{plan.note}</p>
            <Link className={`button ${plan.featured ? "" : "button-secondary"}`} href={plan.name === "Enterprise" ? "/enterprise" : "/contact"}>
              {plan.name === "Enterprise" ? "Talk to us" : "Discuss your setup"}
            </Link>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check aria-hidden="true" /> {feature}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </>
  );
}
