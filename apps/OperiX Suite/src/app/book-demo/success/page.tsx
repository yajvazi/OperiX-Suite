import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Demo Request",
  robots: { index: false, follow: false },
};

export default function DemoSuccessPage() {
  return (
    <section className="page-hero">
      <div className="container">
        <div className="success-card">
          <div className="success-icon"><CheckCircle2 /></div>
          <h1>Request confirmed.</h1>
          <p>The booking experience is ready. Connect an approved CRM, email, or database destination before launch to deliver this request to the OperiX team.</p>
          <div className="button-row"><Link className="button" href="/">Return home</Link><Link className="button button-secondary" href="/products/invoice">Explore products</Link></div>
        </div>
      </div>
    </section>
  );
}
