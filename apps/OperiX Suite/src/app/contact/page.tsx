import type { Metadata } from "next";
import Link from "next/link";
import { CircleHelp, Headphones, MapPin } from "lucide-react";
import { LeadForm } from "@/components/lead-form";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact OperiX for product, sales, and support guidance.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHero title="Let’s talk about your operation." description="Tell us what you are looking to improve, and we’ll help you find the right OperiX starting point." />
      <section className="section">
        <div className="container form-layout">
          <aside className="contact-panel">
            <span className="eyebrow">Contact OperiX</span>
            <h2>Start with the right conversation.</h2>
            <p>Use the form for product questions, rollout planning, partnership discussions, or general guidance.</p>
            <div className="contact-options">
              <div className="contact-option"><div className="icon-box"><Headphones /></div><div><h3>Product guidance</h3><p>Explore Invoice, HR, or the wider suite.</p></div></div>
              <Link className="contact-option" href="/resources"><div className="icon-box"><CircleHelp /></div><div><h3>Help and resources</h3><p>Browse product references and support material.</p></div></Link>
              <div className="contact-option"><div className="icon-box"><MapPin /></div><div><h3>Location</h3><p>Company address and map details will be published after verification.</p></div></div>
            </div>
          </aside>
          <LeadForm kind="contact" />
        </div>
      </section>
    </>
  );
}
