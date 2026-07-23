import type { Metadata } from "next";
import { BarChart3, ReceiptText, Users } from "lucide-react";
import { LeadForm } from "@/components/lead-form";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Book a Demo",
  description: "Request a guided walkthrough of OperiX Suite, OperiX Invoice, or OperiX HR Office.",
  alternates: { canonical: "/book-demo" },
};

export default function BookDemoPage() {
  return (
    <>
      <PageHero title="See OperiX around your workflows." description="Share a little about your organization and choose the product you want to explore." />
      <section className="section">
        <div className="container form-layout">
          <aside className="contact-panel">
            <span className="eyebrow">Guided demo</span>
            <h2>A focused walkthrough, built around your questions.</h2>
            <p>We’ll use your product interest and operational priorities to shape a relevant conversation.</p>
            <div className="contact-options">
              <div className="contact-option"><div className="icon-box"><ReceiptText /></div><div><h3>Invoice workflows</h3><p>Documents, payments, expenses, and reporting.</p></div></div>
              <div className="contact-option"><div className="icon-box"><Users /></div><div><h3>HR workflows</h3><p>Employees, time, leave, payroll, and records.</p></div></div>
              <div className="contact-option"><div className="icon-box"><BarChart3 /></div><div><h3>Suite overview</h3><p>How the product family fits together.</p></div></div>
            </div>
          </aside>
          <LeadForm kind="demo" />
        </div>
      </section>
    </>
  );
}
