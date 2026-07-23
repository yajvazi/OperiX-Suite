"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { faqs } from "@/content/site";

export function FAQList({ limit }: { limit?: number }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="faq-list">
      {faqs.slice(0, limit).map((item, index) => {
        const expanded = open === index;
        return (
          <article className="faq-item" key={item.question}>
            <h3>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`faq-${index}`}
                onClick={() => setOpen(expanded ? -1 : index)}
              >
                <span>{item.question}</span>
                <ChevronDown className={expanded ? "rotated" : ""} aria-hidden="true" />
              </button>
            </h3>
            <div id={`faq-${index}`} className="faq-answer" hidden={!expanded}>
              <p>{item.answer}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
