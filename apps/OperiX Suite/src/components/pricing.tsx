"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useState } from "react";
import { pricingPlans } from "@/content/site";

export function PricingGrid() {
  const [yearly, setYearly] = useState(true);
  return (
    <>
      <div className="billing-toggle" aria-label="Billing period">
        <button type="button" className={!yearly ? "active" : ""} onClick={() => setYearly(false)}>
          Monthly
        </button>
        <button type="button" className={yearly ? "active" : ""} onClick={() => setYearly(true)}>
          Yearly
        </button>
      </div>
      <div className="pricing-grid">
        {pricingPlans.map((plan) => (
          <article className={`pricing-card ${plan.featured ? "featured" : ""}`} key={plan.name}>
            {plan.featured && <span className="plan-label">Recommended</span>}
            <h2>{plan.name}</h2>
            <p>{plan.description}</p>
            <div className="price">
              <strong>{yearly ? plan.yearly : plan.monthly}</strong>
              {plan.monthly !== "—" && plan.monthly !== "Custom" && <span>/ month</span>}
            </div>
            <p className="pricing-note">
              {plan.monthly === "—" ? "Pricing available on request" : "A plan shaped around your operation"}
            </p>
            <Link className={`button ${plan.featured ? "" : "button-secondary"}`} href="/book-demo">
              Contact us
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
